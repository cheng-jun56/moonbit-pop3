import tls from 'node:tls';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {Pop3Client} from './client.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pop3-tls-'));
const keyfile=path.join(dir,'key.pem'),certfile=path.join(dir,'cert.pem');
const results=[];
async function test(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:String(e.stack)})}}
async function serve(options,handler,run){
 const sockets=new Set();
 const server=options?tls.createServer(options,handler):net.createServer(handler);
 server.on('connection',s=>{sockets.add(s);s.on('error',()=>{});s.on('close',()=>sockets.delete(s))});
 server.on('tlsClientError',()=>{});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run({host:'127.0.0.1',port:server.address().port,timeout:1500})}finally{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve))}
}
try {
 const openssl=process.env.OPENSSL??(process.platform==='win32'&&fs.existsSync('C:/Program Files/Git/usr/bin/openssl.exe')?'C:/Program Files/Git/usr/bin/openssl.exe':'openssl');
 const made=spawnSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyfile,'-out',certfile,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{encoding:'utf8',timeout:10000,windowsHide:true});
 assert.equal(made.status,0,made.error?.message||made.stderr);
 const key=fs.readFileSync(keyfile),cert=fs.readFileSync(certfile);
 await test('trusted TLS authenticates retrieves bytes and quits',()=>serve({key,cert},socket=>{
  assert.equal(socket.encrypted,true);socket.write('+OK secure\r\n');let input='';
  socket.on('data',chunk=>{input+=chunk;while(input.includes('\r\n')){
   const at=input.indexOf('\r\n'),line=input.slice(0,at);input=input.slice(at+2);
   if(line==='RETR 1'){socket.write('+OK follows\r\n..hello');socket.write('\r\n.\r\n')}
   else if(line==='QUIT')socket.end('+OK bye\r\n');
   else socket.write('+OK accepted\r\n');
  }});
 },async options=>{
  const client=await Pop3Client.connect({...options,tls:{ca:cert,servername:'localhost'}});
  try{await client.login('demo','test-only');assert.equal((await client.command('RETR',{index:1})).body.toString(),'.hello\r\n');assert.equal((await client.quit()).ok,true)}finally{client.close()}
 }));
 await test('untrusted certificate cannot be bypassed by rejectUnauthorized option',()=>serve({key,cert},()=>{},options=>assert.rejects(Pop3Client.connect({...options,tls:{servername:'localhost',rejectUnauthorized:false}}),/self.signed|certificate/i)));
 await test('hostname mismatch cannot be bypassed by verification callback',()=>serve({key,cert},()=>{},options=>assert.rejects(Pop3Client.connect({...options,tls:{ca:cert,servername:'wrong.example',checkServerIdentity:()=>undefined}}),/hostname|altnames|certificate.*name/i)));
 await test('TLS handshake has absolute deadline',()=>serve(null,()=>{},options=>assert.rejects(Pop3Client.connect({...options,timeout:60}),/timeout/)));
 await test('TLS handshake cancellation releases session',()=>serve(null,()=>{},async options=>{
  const controller=new AbortController();const pending=Pop3Client.connect({...options,signal:controller.signal});
  const rejected=assert.rejects(pending,/tls cancelled/);controller.abort(new Error('tls cancelled'));await rejected;
 }));
} finally {
 for(const file of [keyfile,certfile])if(fs.existsSync(file))fs.unlinkSync(file);
 fs.rmdirSync(dir);
}
const report={timestamp:new Date().toISOString(),results,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,tlsRuntimeTested:true,independentPop3ServerTested:false,fullSuiteRun:false};
fs.writeFileSync(new URL('../evidence/tls-focused-validation.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));process.exitCode=report.failed?1:0;
