import net from 'node:net';
import tls from 'node:tls';
import {randomUUID, createHash} from 'node:crypto';
import * as core from '../web/engine.mjs';

function checked(value) { if (value.startsWith('ERROR:')) throw Error(value); return value; }
function tlsSettings(host, options) {
  const selected = {};
  for (const field of ['ca', 'cert', 'key', 'passphrase', 'minVersion', 'maxVersion']) {
    if (options[field] !== undefined) selected[field] = options[field];
  }
  return {...selected, host, servername: options.servername ?? (net.isIP(host) ? undefined : host),
    rejectUnauthorized: true, checkServerIdentity: tls.checkServerIdentity};
}

/** One outstanding command. TLS is mandatory for passwords unless explicitly opted out. */
export class Pop3Client {
  #key = randomUUID(); #socket; #handlers; #pending; #closed = false;
  #timeout; #signal; #abort; #secure; #tls; #allowAuth; #operation;
  constructor(options = {}) {
    const {host = 'localhost', secure = true, port = secure ? 995 : 110, timeout = 10000,
      signal, tls: tlsOptions = {}, allowInsecureAuth = false, startTls = false} = options;
    if (typeof host !== 'string' || !host || typeof secure !== 'boolean' || typeof startTls !== 'boolean' ||
      (startTls && secure) || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isInteger(timeout) || timeout < 1 || timeout > 2147483647) throw Error('Invalid connection options');
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : Error('Aborted');
    this.#timeout = timeout; this.#signal = signal; this.#secure = secure;
    this.#tls = tlsSettings(host, tlsOptions); this.#allowAuth = allowInsecureAuth === true;
    checked(core.session_open(this.#key));
    this.greeting = this.#wait('GREETING'); this.greeting.catch(() => {});
    try {
      this.#socket = secure ? tls.connect({...this.#tls, port}) : net.connect({host, port});
      this.#bind();
      this.#abort = () => this.#fail(signal.reason instanceof Error ? signal.reason : Error('Aborted'));
      signal?.addEventListener('abort', this.#abort, {once: true});
    } catch (error) { this.#fail(error); }
  }
  static async connect(options = {}) {
    const client = new Pop3Client(options);
    const greeting = await client.greeting;
    if (!greeting.ok || client.#closed) { client.close(); throw Error('Server rejected connection: ' + greeting.message); }
    if (options.startTls) await client.startTls();
    return client;
  }
  get closed() { return this.#closed; }
  get secure() { return !this.#closed && this.#secure && this.#socket?.authorized === true; }
  get state() { return this.#closed ? 'Closed' : checked(core.session_phase(this.#key)); }
  #bind() {
    this.#handlers = {
      data: chunk => this.#receive(chunk),
      error: error => this.#fail(error),
      end: () => {
        try { checked(core.session_finish(this.#key)); } catch (error) { this.#fail(error); return; }
        this.#fail(Error('Connection ended'));
      },
      close: () => this.#fail(Error('Connection closed')),
    };
    for (const [event, handler] of Object.entries(this.#handlers)) this.#socket.on(event, handler);
  }
  #receive(chunk) {
    if (this.#closed) return;
    try {
      const wire = checked(core.session_feed(this.#key, chunk.toString('hex')));
      if (!wire) return;
      const rows = wire.split('\n');
      for (const row of rows) {
        const [ok, message, body, continuation] = row.split(':');
        const pending = this.#pending;
        if (!pending) throw Error('Unsolicited server reply');
        const result = {ok: ok === '1', message: Buffer.from(message, 'hex').toString('utf8'), body: Buffer.from(body, 'hex')};
        if (continuation === '1') {
          // The core may have consumed a coalesced -ERR after the challenge.
          // Its final reply wins; never send credentials after cancellation.
          if (rows.length > 1) continue;
          if (pending.verb !== 'AUTH' || pending.response === undefined || pending.sent) throw Error('Unexpected AUTH challenge');
          // PLAIN has no server challenge. Cancel and consume -ERR before reuse.
          const response = result.message === '' ? pending.response : '*';
          pending.sent = true;
          if (response === '*') pending.authError = Error('PLAIN server sent a nonempty challenge');
          this.#write(checked(core.session_continue(this.#key, 'auth', response)));
          pending.response = undefined;
          continue;
        }
        if (pending.verb === 'STLS' && result.ok) this.#socket.pause();
        this.#pending = undefined; clearTimeout(pending.timer);
        if (pending.authError) pending.reject(pending.authError); else pending.resolve(result);
      }
    } catch (error) { this.#fail(error); }
  }
  #wait(verb, response) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.#fail(Error('POP3 response timeout')), this.#timeout);
      this.#pending = {verb, response, resolve, reject, timer};
    });
  }
  #fail(error) {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#pending) { clearTimeout(this.#pending.timer); this.#pending.reject(error); this.#pending = undefined; }
    this.#signal?.removeEventListener('abort', this.#abort);
    core.session_close(this.#key); this.#socket?.destroy();
  }
  #write(wire) { this.#socket.write(wire, 'utf8', error => { if (error) this.#fail(error); }); }
  async #exclusive(run) {
    if (this.#closed || this.#pending || this.#operation) throw Error('Client is closed or a command is already pending');
    const token = Symbol(); this.#operation = token;
    try { return await run(token); } finally { if (this.#operation === token) this.#operation = undefined; }
  }
  async #command(verb, {argument = '', index = -1, lines = 0, digest = ''} = {}, token, response) {
    if (this.#closed) throw Error('Connection closed');
    if (this.#pending || (this.#operation && token !== this.#operation)) throw Error('A command is already pending');
    if (typeof verb !== 'string' || typeof argument !== 'string' || typeof digest !== 'string' ||
      !Number.isInteger(index) || index < -1 || index > 2147483647 || !Number.isInteger(lines) || lines < 0 || lines > 2147483647) throw Error('Invalid command arguments');
    verb = verb.toUpperCase();
    if (['USER', 'PASS', 'AUTH'].includes(verb) && !this.#secure && !this.#allowAuth) throw Error('Authentication requires TLS or explicit allowInsecureAuth');
    const wire = checked(core.session_issue(this.#key, verb, argument, index, lines, digest));
    const reply = this.#wait(verb, response); this.#write(wire); return reply;
  }
  async command(verb, args = {}) {
    if (typeof verb === 'string' && ['STLS', 'AUTH'].includes(verb.toUpperCase())) throw Error('Use startTls or authenticatePlain');
    return this.#command(verb, args);
  }
  async login(user, password) {
    return this.#exclusive(async token => {
      let reply = await this.#command('USER', {argument: user}, token);
      if (!reply.ok) throw Error('USER rejected: ' + reply.message);
      reply = await this.#command('PASS', {argument: password}, token);
      if (!reply.ok) throw Error('PASS rejected: ' + reply.message);
      return reply;
    });
  }
  async apop(user, secret) {
    const greeting = await this.greeting;
    const challenges = greeting.message.match(/<[^<>\s]+>/g) || [];
    if (challenges.length !== 1 || !challenges[0].includes('@') || !/^[\x21-\x7e]+$/.test(challenges[0])) throw Error('No unambiguous APOP challenge');
    if (typeof secret !== 'string' && !Buffer.isBuffer(secret)) throw Error('APOP secret must be text or Buffer');
    const digest = createHash('md5').update(challenges[0], 'ascii').update(secret).digest('hex');
    const reply = await this.command('APOP', {argument: user, digest});
    if (!reply.ok) throw Error('APOP rejected: ' + reply.message);
    return reply;
  }
  async #capabilities(token) {
    const reply = await this.#command('CAPA', {}, token);
    if (!reply.ok) throw Error('CAPA rejected: ' + reply.message);
    const capabilities = new Map();
    for (const line of reply.body.toString('latin1').split('\r\n').slice(0, -1)) {
      if (!/^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(line)) throw Error('Invalid CAPA line');
      const [tag, ...args] = line.split(' '), key = tag.toUpperCase();
      if (capabilities.has(key)) throw Error('Duplicate CAPA tag');
      capabilities.set(key, args);
    }
    return capabilities;
  }
  async capabilities() { return this.#capabilities(); }
  async startTls() {
    if (this.#secure) throw Error('TLS is already active');
    if (this.state !== 'Authorization') throw Error('STLS requires authorization state');
    return this.#exclusive(async token => {
      try {
        if (!(await this.#capabilities(token)).has('STLS')) throw Error('Server does not advertise STLS');
        const reply = await this.#command('STLS', {}, token);
        if (!reply.ok) throw Error('STLS rejected: ' + reply.message);
        if (this.#closed) throw Error('Connection closed during STLS');
        const raw = this.#socket;
        for (const [event, handler] of Object.entries(this.#handlers)) raw.off(event, handler);
        const handshake = this.#wait('TLS');
        try {
          this.#socket = tls.connect({...this.#tls, socket: raw}); this.#bind();
          this.#socket.once('secureConnect', () => {
            try {
              if (this.#closed) return;
              checked(core.session_continue(this.#key, 'tls', ''));
              this.#secure = true;
              const pending = this.#pending; this.#pending = undefined;
              clearTimeout(pending.timer); pending.resolve();
            } catch (error) { this.#fail(error); }
          });
          this.#socket.resume();
        } catch (error) { raw.destroy(); this.#fail(error); }
        await handshake;
        return await this.#capabilities(token);
      } catch (error) { this.#fail(error); throw error; }
    });
  }
  async authenticatePlain(user, password, authorizationId = '') {
    if (!this.#secure && !this.#allowAuth) throw Error('Authentication requires TLS or explicit allowInsecureAuth');
    // Printable ASCII is a deliberately bounded subset until SASLprep is implemented.
    if (![user, password, authorizationId].every(x => typeof x === 'string' && /^[\x20-\x7e]*$/.test(x)) || !user || !password) throw Error('PLAIN requires nonempty ASCII user/password and optional ASCII authorizationId');
    const data = Buffer.from(authorizationId + '\0' + user + '\0' + password, 'ascii').toString('base64');
    if (data.length > 16380) throw Error('PLAIN credential length limit');
    return this.#exclusive(async token => {
      const caps = await this.#capabilities(token);
      if (!(caps.get('SASL') ?? []).includes('PLAIN')) throw Error('Server does not advertise SASL PLAIN');
      const result = await this.#command('AUTH', {argument: 'PLAIN'}, token, data);
      if (!result.ok) throw Error('AUTH rejected: ' + result.message);
      return result;
    });
  }
  async quit() { try { return await this.command('QUIT'); } finally { this.close(); } }
  close() { this.#fail(Error('Client closed')); }
}
