import net from 'node:net';
import tls from 'node:tls';
import {randomUUID,createHash} from 'node:crypto';
import * as core from '../web/engine.mjs';
function checked(value){if(value.startsWith('ERROR:'))throw new Error(value);return value}
export class Pop3Client {
 #key=randomUUID(); #socket; #pending; #closed=false; #timeout; #signal; #abort;
 constructor(options={}){
  const {host='localhost',secure=true,port=secure?995:110,timeout=10000,signal,tls:tlsOptions={}}=options;
  if(!Number.isInteger(port)||port<1||port>65535||!Number.isFinite(timeout)||timeout<1)throw new Error('Invalid port or timeout');
  if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:new Error('Aborted');
  this.#timeout=timeout;this.#signal=signal;
  checked(core.session_open(this.#key));
  this.greeting=this.#wait();
  // Attach handlers before handing the promise to callers, including sync setup failure.
  this.greeting.catch(()=>{});
  try {
   this.#socket=secure?tls.connect({...tlsOptions,host,port,servername:tlsOptions.servername ?? (net.isIP(host)?undefined:host),rejectUnauthorized:true,checkServerIdentity:tls.checkServerIdentity}):net.connect({host,port});
   this.#socket.on('data',chunk=>{
    try {
     const wire=checked(core.session_feed(this.#key,chunk.toString('hex')));
     if(!wire)return;
     for(const row of wire.split('\n')){
      const [ok,message,body]=row.split(':');
      if(!this.#pending)throw new Error('Unsolicited server reply');
      const pending=this.#pending;this.#pending=undefined;clearTimeout(pending.timer);
      pending.resolve({ok:ok==='1',message:Buffer.from(message,'hex').toString('utf8'),body:Buffer.from(body,'hex')});
     }
    }catch(error){this.#fail(error)}
   });
   this.#socket.on('error',error=>this.#fail(error));
   this.#socket.on('end',()=>{
    try {checked(core.session_finish(this.#key))}catch(error){this.#fail(error);return}
    this.#fail(new Error('Connection ended'));
   });
   this.#socket.on('close',()=>this.#fail(new Error('Connection closed')));
   this.#abort=()=>this.#fail(signal.reason instanceof Error?signal.reason:new Error('Aborted'));
   signal?.addEventListener('abort',this.#abort,{once:true});
  }catch(error){this.#fail(error)}
 }
 static async connect(options={}){
  const client=new Pop3Client(options);
  const greeting=await client.greeting;
  if(!greeting.ok){client.close();throw new Error('Server rejected connection: '+greeting.message)}
  return client;
 }
 #wait(){
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.#fail(new Error('POP3 response timeout')),this.#timeout);
   this.#pending={resolve,reject,timer};
  });
 }
 #fail(error){
  if(this.#closed)return;
  this.#closed=true;
  if(this.#pending){clearTimeout(this.#pending.timer);this.#pending.reject(error);this.#pending=undefined}
  this.#signal?.removeEventListener('abort',this.#abort);
  core.session_close(this.#key);
  this.#socket?.destroy();
 }
 async command(verb,{argument='',index=-1,lines=0,digest=''}={}){
  if(this.#closed)throw new Error('Connection closed');
  if(this.#pending)throw new Error('A command is already pending');
  if(typeof verb!=='string'||typeof argument!=='string'||typeof digest!=='string'||!Number.isInteger(index)||index < -1||index>2147483647||!Number.isInteger(lines)||lines<0||lines>2147483647)throw new Error('Invalid command arguments');
  const wire=checked(core.session_issue(this.#key,verb.toUpperCase(),argument,index,lines,digest));
  const reply=this.#wait();
  this.#socket.write(wire,'utf8',error=>{if(error)this.#fail(error)});
  return reply;
 }
 async login(user,password){
  let reply=await this.command('USER',{argument:user});
  if(!reply.ok)throw new Error('USER rejected: '+reply.message);
  reply=await this.command('PASS',{argument:password});
  if(!reply.ok)throw new Error('PASS rejected: '+reply.message);
  return reply;
 }
 async apop(user,secret){
  const greeting=await this.greeting;
  const challenges=greeting.message.match(/<[^<>\s]+>/g)||[];
  if(challenges.length!==1||!challenges[0].includes('@')||!/^[\x21-\x7e]+$/.test(challenges[0]))throw new Error('No unambiguous APOP challenge');
  if(typeof secret!=='string'&&!Buffer.isBuffer(secret))throw new Error('APOP secret must be text or Buffer');
  const digest=createHash('md5').update(challenges[0],'ascii').update(secret).digest('hex');
  const reply=await this.command('APOP',{argument:user,digest});
  if(!reply.ok)throw new Error('APOP rejected: '+reply.message);
  return reply;
 }
 async capabilities(){
  const reply=await this.command('CAPA');
  if(!reply.ok)throw new Error('CAPA rejected: '+reply.message);
  const capabilities=new Map();
  for(const line of reply.body.toString('latin1').split('\r\n').slice(0,-1)){
   if(!/^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/.test(line))throw new Error('Invalid CAPA line');
   const [tag,...args]=line.split(' '),key=tag.toUpperCase();
   if(capabilities.has(key))throw new Error('Duplicate CAPA tag');
   capabilities.set(key,args);
  }
  return capabilities;
 }
 async quit(){try{return await this.command('QUIT')}finally{this.close()}}
 close(){this.#fail(new Error('Client closed'))}
 get closed(){return this.#closed}
}
