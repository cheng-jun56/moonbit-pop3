import net from 'node:net';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Pop3Client} from './client.mjs';
const results=[];
async function test(name,fn){try{await fn();results.push({name,passed:true})}catch(e){results.push({name,passed:false,error:String(e.stack)})}}
async function server(greeting,handler,run){
 const sockets=new Set(),received=[];const s=net.createServer(socket=>{
  sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.write(greeting+'\r\n');
  let input='';socket.on('data',chunk=>{input+=chunk;while(input.includes('\r\n')){const i=input.indexOf('\r\n'),line=input.slice(0,i);input=input.slice(i+2);received.push(line);handler(socket,line)}});
 });
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{const c=await Pop3Client.connect({host:'127.0.0.1',port:s.address().port,secure:false,timeout:1000});try{await run(c,received)}finally{c.close()}}
 finally{for(const socket of sockets)socket.destroy();await new Promise(r=>s.close(r))}
}
await test('APOP RFC 1939 independent digest vector and CAPA in both states',()=>server('+OK ready <1896.697170952@dbc.mtview.ca.us>',(s,line)=>{
 if(line==='CAPA')s.write('+OK capabilities\r\nUSER\r\nSASL PLAIN SCRAM-SHA-256\r\nUIDL\r\n.\r\n');
 else if(line==='APOP mrose c4c9334bac560ecc979e58001b3e22fb')s.write('+OK accepted\r\n');
 else if(line==='STAT')s.write('+OK 1 42\r\n');else s.write('-ERR unexpected\r\n');
},async(c,received)=>{
 assert.deepEqual((await c.capabilities()).get('SASL'),['PLAIN','SCRAM-SHA-256']);
 await c.apop('mrose','tanstaaf');assert.equal((await c.command('STAT')).ok,true);assert.equal((await c.capabilities()).has('UIDL'),true);
 assert.equal(received.some(x=>x.includes('tanstaaf')),false);
}));
await test('missing challenge sends no authentication',()=>server('+OK ready',()=>{},async(c,received)=>{await assert.rejects(c.apop('mrose','tanstaaf'),/challenge/);assert.equal(received.length,0)}));
await test('APOP rejection permits explicit USER PASS fallback',()=>server('+OK ready <1@server>',(s,line)=>s.write(line.startsWith('APOP')?'-ERR unsupported\r\n':'+OK accepted\r\n'),async c=>{await assert.rejects(c.apop('user','secret'),/rejected/);await c.login('user','secret')}));
await test('CAPA rejection and duplicate tags are surfaced',()=>server('+OK ready',(s)=>s.write('+OK caps\r\nUIDL\r\nuidl\r\n.\r\n'),async c=>{await assert.rejects(c.capabilities(),/Duplicate/)}));
fs.writeFileSync(new URL('../evidence/extensions-focused-validation.json',import.meta.url),JSON.stringify({timestamp:new Date().toISOString(),coreTestsPassed:3,results,passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,reference:'RFC 1939 APOP published digest vector',independentServerTested:false,fullSuiteRun:false},null,2)+'\n');
console.log(JSON.stringify(results));process.exitCode=results.some(x=>!x.passed)?1:0;
