import net from 'node:net';
import assert from 'node:assert/strict';
import {Pop3Client} from './client.mjs';
import fs from 'node:fs';
const results=[];
async function test(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:String(e.stack)})}}
async function server(fn,run){
 const sockets=new Set();const s=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));fn(socket)});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{await run({host:'127.0.0.1',port:s.address().port,secure:false,allowInsecureAuth:true,timeout:1000})}finally{for(const socket of sockets)socket.destroy();await new Promise(r=>s.close(r))}
}
function conversation(socket){
 socket.write('+O');setTimeout(()=>socket.write('K ready\r\n'),5);
 let input='';socket.on('data',chunk=>{input+=chunk;while(input.includes('\r\n')){
  const i=input.indexOf('\r\n');const line=input.slice(0,i);input=input.slice(i+2);
  if(line==='USER demo'||line==='PASS secret'||line==='RSET')socket.write('+OK accepted\r\n');
  else if(line==='STAT')socket.write('+OK 1 4\r\n');
  else if(line==='RETR 1'){socket.write(Buffer.from('+OK follows\r\n..binary'));socket.write(Buffer.from([255,0,13,10]));socket.write('.\r\n')}
  else if(line==='DELE 1')socket.write('-ERR denied\r\n');
  else if(line==='QUIT')socket.end('+OK bye\r\n');
  else socket.write('+OK\r\n');
 }});
}
await test('fragmented greeting login binary retrieval rejection and quit',()=>server(conversation,async options=>{
 const c=await Pop3Client.connect(options);try{
  await assert.rejects(c.command('STAT'),/authentication/);
  await c.login('demo','secret');
  assert.equal((await c.command('STAT')).message,'1 4');
  assert.deepEqual((await c.command('RETR',{index:1})).body,Buffer.concat([Buffer.from('.binary'),Buffer.from([255,0,13,10])]));
  assert.equal((await c.command('DELE',{index:1})).ok,false);
  assert.equal((await c.command('RSET')).ok,true);
  assert.equal((await c.quit()).ok,true);assert.equal(c.closed,true);
 }finally{c.close()}
}));
await test('greeting timeout',()=>server(()=>{},options=>assert.rejects(Pop3Client.connect({...options,timeout:40}),/timeout/)));
await test('truncated response rejects pending command',()=>server(socket=>{socket.write('+OK hi\r\n');socket.once('data',()=>socket.end('+OK partial'))},async options=>{
 const c=await Pop3Client.connect(options);await assert.rejects(c.command('USER',{argument:'a'}),/truncated/);assert.equal(c.closed,true);
}));
await test('pending command protection and cancellation',()=>server(socket=>socket.write('+OK hi\r\n'),async options=>{
 const controller=new AbortController();const c=await Pop3Client.connect({...options,signal:controller.signal});
 const pending=c.command('USER',{argument:'a'});await assert.rejects(c.command('USER',{argument:'b'}),/pending/);
 const rejected=assert.rejects(pending,/cancelled/);controller.abort(new Error('cancelled'));await rejected;assert.equal(c.closed,true);
}));
await test('command injection rejected before transport',()=>server(conversation,async options=>{
 const c=await Pop3Client.connect(options);try{await assert.rejects(c.command('USER',{argument:'bad\r\nQUIT'}));await c.login('demo','secret')}finally{c.close()}
}));
fs.writeFileSync(new URL('../evidence/network-focused-validation.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),results,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,tlsRuntimeTested:false,independentServerTested:false,fullSuiteRun:false},null,2)+'\n');
console.log(JSON.stringify(results));process.exitCode=results.some(x=>!x.passed)?1:0;
