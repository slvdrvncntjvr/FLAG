import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
let active;
export function assertDevIntakeLock(){if(!active?.alive)throw Error('Exclusive dev writer lease required');}
export function devIntakeSignal(){assertDevIntakeLock();return active.controller.signal;}
// The lease process owns the Windows mutex and watches this Node process. Node
// aborts all guarded HTTP work if the lease dies. The next owner waits a recovery
// quiet period after an abandoned mutex; this is not a remote atomic CAS.
export async function withDevIntakeLock(role,receiptPath,operation){
 if(process.platform!=='win32'||active)throw Error('One Windows dev writer lease required');
 const child=spawn('pwsh.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-File',resolve(import.meta.dirname,'../../scripts/dev-intake-lock.ps1'),'-OwnerProcessId',String(process.pid),'-Role',role,'-ReceiptPath',resolve(receiptPath)],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 const controller=new AbortController();
 let alive=true,acquired=false,buffer='';
 child.stdin.on('error',()=>{});
 const exited=new Promise(resolveExit=>{child.once('error',()=>{alive=false;controller.abort();resolveExit(-1);});child.once('exit',code=>{alive=false;controller.abort();resolveExit(code??-1);});});
 child.stderr.resume();
 try{
  await new Promise((ready,reject)=>{
   const timer=setTimeout(()=>reject(Error('Dev writer lease acquisition incomplete')),215000);
   child.stdout.on('data',chunk=>{buffer+=chunk.toString();if(buffer.includes('{"event":"acquired"}')){clearTimeout(timer);acquired=true;active={alive:true,controller};ready();}if(buffer.length>4096)buffer=buffer.slice(-4096);});
   exited.then(()=>{clearTimeout(timer);if(active)active.alive=false;if(!acquired)reject(Error('Dev writer lease unavailable'));});
  });
  return await operation();
 }finally{
  if(active)active.alive=alive;
  if(alive){child.stdin.end('release\n');}
  const code=await exited;
  active=undefined;
  if(acquired&&code!==0)throw Error('Dev writer lease lost; retain uncertain evidence');
 }
}
