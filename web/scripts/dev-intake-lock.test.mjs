import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {appendFileSync,readFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {withDevIntakeLock,devIntakeSignal} from './dev-intake-lock.mjs';
const file=fileURLToPath(import.meta.url);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
if(process.argv[2]==='fixture'){
 const [events,lock,mode]=process.argv.slice(3);
 const record=kind=>{appendFileSync(events,JSON.stringify({kind,at:Date.now(),pid:process.pid})+'\n');};
 try{
  await withDevIntakeLock('test',lock,async()=>{
   record('entered');console.log('fixture-entered');
   if(mode==='owner-death')process.exit(23);
   if(mode==='lease-death'){
    const lease=Number(execFileSync('pwsh.exe',['-NoProfile','-NonInteractive','-Command',`(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${process.pid}' | Where-Object { $_.ProcessId -ne $PID -and $_.Name -eq 'pwsh.exe' -and $_.CommandLine -like '*dev-intake-lock.ps1*' }).ProcessId`],{stdio:['ignore','pipe','pipe'],windowsHide:true}).toString().trim());
    if(!Number.isInteger(lease)||lease<1)throw Error('Test lease identity unavailable');
    const aborted=new Promise(r=>devIntakeSignal().addEventListener('abort',r,{once:true}));
    process.kill(lease);await aborted;record('lease-loss-observed');throw Error('Expected test lease loss');
   }
   if(mode==='hold'){record('open-attempted');await delay(400);record('open-failed');await delay(400);record('emergency-close-entered');await delay(400);}
   else await delay(mode==='wall-limit'?35000:mode==='hold-deadline'?25000:20);
   record('leaving');
  });
 }catch{record('operation-failed');process.exitCode=24;}
}else{
 const root=resolve(import.meta.dirname,'../../temporary/intake-lock-tests-'+randomUUID());
 if(process.platform==='win32')mkdirSync(root);
 function fixture(name,mode){
  const events=resolve(root,name+'.jsonl'),lock=resolve(root,name+'.lock.json');
  const child=spawn(process.execPath,[file,'fixture',events,lock,mode],{stdio:['ignore','pipe','pipe'],windowsHide:true});
  let text='';child.stderr.resume();
  const ended=new Promise(r=>child.once('exit',code=>r(code)));
  const entered=new Promise((r,j)=>{child.stdout.on('data',c=>{text+=c;if(text.includes('fixture-entered'))r();});ended.then(()=>{if(!text.includes('fixture-entered'))j(Error('Fixture did not acquire'));});});
  return {child,events,lock,ended,entered};
 }
 const rows=f=>readFileSync(f,'utf8').trim().split('\n').map(JSON.parse);
 const receipt=f=>JSON.parse(readFileSync(f,'utf8'));
 test('independent deadline writer waits for entire opener/failure-close critical section',{skip:process.platform!=='win32'},async()=>{
  const a=fixture('concurrent-open','hold');await a.entered;const b=fixture('concurrent-guard','quick');assert.equal(await a.ended,0);assert.equal(await b.ended,0);
  assert.ok(rows(b.events)[0].at>=rows(a.events).find(r=>r.kind==='leaving').at);assert.equal(receipt(a.lock).released,true);assert.equal(receipt(b.lock).released,true);
 });
 test('owner process death retains lock through recovery quiet period before independent guard',{skip:process.platform!=='win32'},async()=>{
  const a=fixture('owner-death','owner-death');await a.entered;assert.equal(await a.ended,23);const b=fixture('owner-death-guard','quick');assert.equal(await b.ended,0);
  const recovery=receipt(a.lock);assert.equal(recovery.ownerDied,true);assert.equal(recovery.recoveryQuietSeconds,30);assert.equal(recovery.released,true);assert.ok(rows(b.events)[0].at-rows(a.events)[0].at>=29000);
 });
 test('lease process death aborts writer and abandoned mutex recovery delays next writer',{skip:process.platform!=='win32'},async()=>{
  const a=fixture('lease-death','lease-death');await a.entered;assert.equal(await a.ended,24);const b=fixture('abandoned-guard','quick');assert.equal(await b.ended,0);
  assert.ok(rows(a.events).some(r=>r.kind==='lease-loss-observed'));const recovery=receipt(b.lock);assert.ok(recovery.abandoned||recovery.uncleanOwnerMarker);assert.equal(recovery.recoveryQuietSeconds,30);
 });
 test('lease enforces bounded owner wall time and retains quiet period after termination',{skip:process.platform!=='win32'},async()=>{
  const a=fixture('wall-limit','wall-limit');await a.entered;const b=fixture('wall-limit-guard','quick');assert.notEqual(await a.ended,0);assert.equal(await b.ended,0);
  const recovery=receipt(a.lock);assert.equal(recovery.ownerWallLimitReached,true);assert.equal(recovery.ownerDied,true);assert.equal(recovery.recoveryQuietSeconds,30);assert.ok(rows(b.events)[0].at-rows(a.events)[0].at>=59000);
 });
 test('print retained coordination evidence location',{skip:process.platform!=='win32'},()=>{console.log('Coordination evidence: '+root);});
}
