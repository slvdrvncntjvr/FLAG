// Dev-only bounded synthetic window. Review the complete PS/Node interaction
// before executing: the independent Windows guard must finish a false-only run.
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,renameSync,existsSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DEV_ACCOUNT,DEV_DATABASE,intakeState,closedBindings,containedEligible,retainedMetadata,privacyReady,alignedSource,derivedSource,closeIntake,exactMigrationSet} from './dev-synthetic-intake.mjs';
import {withDevIntakeLock,assertDevIntakeLock,devIntakeSignal} from './dev-intake-lock.mjs';
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const writable=v=>Object.fromEntries(['workers/message','workers/tag'].filter(k=>Object.hasOwn(v.annotations??{},k)).map(k=>[k,v.annotations[k]]));
export function fingerprint(snapshot,{restoration=false}={}){
 const version=snapshot.currentVersion??snapshot.version,script=version.resources.script;
 if(typeof script?.etag!=='string'||!script.etag)throw Error('Authoritative script digest required');
 const settings=retainedMetadata(snapshot.settings);
 // Logging drift is reported separately; it must not prevent emergency close.
 if(restoration)for(const k of ['observability','tail_consumers','logpush'])delete settings[k];
 return createHash('sha256').update(stable({settings,script:{etag:script.etag,handlers:script.handlers??null,named_handlers:script.named_handlers??null},runtime:version.resources.script_runtime,annotations:writable(version)})).digest('hex');
}
export function validateBaseline(b,now=Date.now()){
 if(b?.kind!=='flag-dev-synthetic-window-v1'||b.worker!=='flag-dev'||b.account!==DEV_ACCOUNT||!(/^[a-f0-9]{64}$/.test(b.sourceFingerprint??''))||!(/^[a-f0-9]{64}$/.test(b.restorationFingerprint??''))||!(/^[a-f0-9-]{36}$/.test(b.reviewedVersion??''))||!(/^[a-f0-9-]{36}$/.test(b.windowId??'')))throw Error('Invalid dev window authority');
 const created=Date.parse(b.createdAt),deadline=Date.parse(b.deadline);
 if(!Number.isFinite(created)||!Number.isFinite(deadline)||deadline-created!==300000||created>now+5000)throw Error('Invalid bounded lifetime');
 return {created,deadline};
}
export function authorizeSnapshot(snapshot,baseline,{restoration=false,now=Date.now()}={}){
 const times=validateBaseline(baseline,now),v=snapshot.currentVersion??snapshot.version;
 const source=alignedSource(snapshot.settings,snapshot.deployments,snapshot.versions,v,v.id);
 if(fingerprint(snapshot,{restoration})!==(restoration?baseline.restorationFingerprint:baseline.sourceFingerprint))throw Error('Reviewed fingerprint mismatch');
 if(!restoration&&(times.deadline-now<120000||intakeState(snapshot.settings)!=='false'||!privacyReady(snapshot.settings)))throw Error('Opening prerequisite or remaining lifetime failed');
 return source;
}
export function validatePreflight(p,baseline,now=Date.now()){
 const {created,deadline}=validateBaseline(baseline,now);
 const observed=Date.parse(p?.at);
 if(p?.mode!=='restore'||p.windowId!==baseline.windowId||p.result!=='pass'||p.mutationAttempted!==false||p.confirmedState!=='false'||p.restorationFingerprint!==baseline.restorationFingerprint||!Number.isFinite(observed)||observed<created||observed>now||now>=deadline-60000)throw Error('Fresh independent false-only preflight required');
}
export async function openWindow({baseline,preflight,readSnapshot,readInventory,patch,restore,settleUncertain=async()=>{},now=()=>Date.now()}){
 const receipt={mode:'open',windowId:baseline.windowId,mutationAttempted:false,confirmedState:'unknown',result:'failed'};
 let before;
 try{
  validatePreflight(preflight,baseline,now());
  before=await readSnapshot();receipt.source=authorizeSnapshot(before,baseline,{now:now()});
  const inventory=await readInventory();if(stable(inventory)!==stable(baseline.eligible))throw Error('Eligible inventory changed');
  // Recheck source and settings after inventory and immediately before PATCH.
  const fresh=await readSnapshot();authorizeSnapshot(fresh,baseline,{now:now()});
  if(stable(before.settings)!==stable(fresh.settings))throw Error('Settings changed before open');
  if(Date.parse(baseline.deadline)-now()<120000)throw Error('Insufficient bounded opener/recovery time before true PATCH');
  receipt.mutationAttempted=true;
  await patch({bindings:closedBindings(fresh.settings).map(b=>b.name==='PRIVATE_INTAKE_ENABLED'?{...b,text:'true'}:b),annotations:writable(fresh.currentVersion??fresh.version)});
  receipt.patchResponseConfirmed=true;
 }catch{receipt.failure='Open refused or transport uncertain';}
 // Every attempted mutation gets fresh readback, including a transport timeout.
 try{
  const after=await readSnapshot();receipt.confirmedState=intakeState(after.settings);
  if(receipt.mutationAttempted){receipt.derivedSource=derivedSource(before,after);receipt.metadataFingerprintPreserved=fingerprint(after)===baseline.sourceFingerprint;}
  if(receipt.patchResponseConfirmed&&receipt.confirmedState==='true'&&receipt.metadataFingerprintPreserved&&receipt.derivedSource&&now()<Date.parse(baseline.deadline))receipt.result='pass';
 }catch{receipt.readbackOrEquivalenceFailed=true;}
 if(receipt.result!=='pass'&&receipt.mutationAttempted){try{if(!receipt.patchResponseConfirmed||receipt.readbackOrEquivalenceFailed){receipt.uncertainRequestQuietSeconds=30;await settleUncertain();}receipt.emergencyClose=await restore();receipt.confirmedState=receipt.emergencyClose.confirmedState;}catch{receipt.emergencyCloseUncertain=true;}}
 return receipt;
}
function writeNew(path,value){const target=resolve(path);if(existsSync(target))throw Error('Preserve prior evidence');const partial=target+'.partial';writeFileSync(partial,JSON.stringify(value,null,2)+'\n',{flag:'wx'});renameSync(partial,target);}
async function main(){
 const [mode,baselinePath,receiptPath,extra]=process.argv.slice(2);
 if(!['prepare','restore','open'].includes(mode)||!baselinePath||!receiptPath||(mode==='prepare'&&!/^[a-f0-9-]{36}$/.test(extra??''))||(mode==='open'&&!extra)||(mode==='restore'&&extra)||process.argv.length!==(mode==='restore'?5:6))throw Error('Use prepare baseline receipt reviewedVersion; restore baseline receipt; or open baseline receipt independentPreflightReceipt');
 if(existsSync(resolve(receiptPath))||(mode==='prepare'&&existsSync(resolve(baselinePath))))throw Error('Preserve evidence');
 const web=resolve(import.meta.dirname,'..');
 const auth=JSON.parse(execFileSync(process.execPath,[resolve(web,'node_modules/wrangler/bin/wrangler.js'),'auth','token','--env','dev','--json'],{cwd:web,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:DEV_ACCOUNT,WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false'},timeout:10000,stdio:['ignore','pipe','pipe']}));
 let receipt={at:new Date().toISOString(),mode,worker:'flag-dev',mutationAttempted:false,confirmedState:'unknown',result:'failed'};
 const base='https://api.cloudflare.com/client/v4/accounts/'+DEV_ACCOUNT;
 const api=async(path,init={})=>{if(mode!=='prepare')assertDevIntakeLock();const signal=mode==='prepare'?AbortSignal.timeout(20000):AbortSignal.any([AbortSignal.timeout(20000),devIntakeSignal()]);const r=await fetch(base+path,{...init,headers:{Authorization:'Bearer '+auth.token,...init.headers},signal});const j=await r.json();if(!r.ok||!j.success)throw Error('Dev operation unavailable');return j.result;};
 const patch=async settings=>{const body=new FormData();body.append('settings',new Blob([JSON.stringify(settings)],{type:'application/json'}));return api('/workers/scripts/flag-dev/settings',{method:'PATCH',body});};
 const query=async sql=>(await api('/d1/database/'+DEV_DATABASE+'/query',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sql,params:[]})}))[0].results;
 const inventory=async()=>containedEligible(await query(`SELECT u.id,(SELECT count(DISTINCT p.policy) FROM policy_acceptance p JOIN current_policy_version c ON c.policy=p.policy AND c.version=p.version WHERE p.user_id=u.id AND p.retired_at IS NULL AND p.policy IN ('privacy','terms','freelancer_ack')) AS current_policies FROM user u JOIN freelancer_profile f ON f.user_id=u.id WHERE u.role='freelancer' AND u.banned=0 AND u.deactivated_at IS NULL AND f.status='verified' AND (SELECT count(DISTINCT p.policy) FROM policy_acceptance p JOIN current_policy_version c ON c.policy=p.policy AND c.version=p.version WHERE p.user_id=u.id AND p.retired_at IS NULL AND p.policy IN ('privacy','terms','freelancer_ack'))=3`).then(rows=>rows.sort((a,b)=>a.id.localeCompare(b.id))));
 async function readiness(){
  const eligible=await inventory(),migrations=exactMigrationSet(await query('SELECT name FROM d1_migrations ORDER BY id'),readdirSync(resolve(web,'drizzle')).filter(n=>/^\d{4}_.+\.sql$/.test(n)));
  const managed=await api('/r2/buckets/flag-proofs-dev/domains/managed'),custom=await api('/r2/buckets/flag-proofs-dev/domains/custom'),schedules=await api('/workers/scripts/flag-dev/schedules');
  if(managed.enabled!==false||!Array.isArray(custom.domains)||custom.domains.some(d=>d.enabled!==false)||schedules.schedules?.length!==1||schedules.schedules[0].cron!=='0 * * * *')throw Error('Private bucket/hourly maintenance prerequisite failed');
  return {eligible,migrations,privateBucket:true,hourlyCron:true};
 }
 async function snapshot(){const deployments=await api('/workers/scripts/flag-dev/deployments'),versions=await api('/workers/scripts/flag-dev/versions');const id=[...versions.items].sort((a,b)=>b.number-a.number)[0]?.id;if(!/^[a-f0-9-]{36}$/.test(id??''))throw Error('No latest source');const version=await api('/workers/scripts/flag-dev/versions/'+id),settings=await api('/workers/scripts/flag-dev/settings');return {deployments,versions,version,settings};}
 try{
  let baseline;
  if(mode==='prepare'){
   const s=await snapshot();const source=alignedSource(s.settings,s.deployments,s.versions,s.version,extra);
   if(intakeState(s.settings)!=='false'||!privacyReady(s.settings)||!s.version.resources.script.handlers.includes('fetch')||!s.version.resources.script.handlers.includes('scheduled'))throw Error('Disabled/private prerequisite required');
   const {eligible,migrations}=await readiness();
   const now=Math.floor(Date.now()/1000)*1000;baseline={kind:'flag-dev-synthetic-window-v1',account:DEV_ACCOUNT,worker:'flag-dev',windowId:randomUUID(),createdAt:new Date(now).toISOString(),deadline:new Date(now+300000).toISOString(),reviewedVersion:extra,sourceFingerprint:fingerprint(s),restorationFingerprint:fingerprint(s,{restoration:true}),eligible,migrations};
   validateBaseline(baseline);writeNew(baselinePath,baseline);Object.assign(receipt,{windowId:baseline.windowId,baselinePath:resolve(baselinePath),deadline:baseline.deadline,source,confirmedState:'false',result:'pass'});
  }else{
   baseline=JSON.parse(readFileSync(resolve(baselinePath),'utf8'));validateBaseline(baseline);receipt.windowId=baseline.windowId;
   const restore=async()=>{
    const initial=await snapshot();authorizeSnapshot(initial,baseline,{restoration:true});
    const expected=initial.version.id;
    // Validate the reviewed fingerprint on every pre/post close read. Logging
    // differences are allowed for closing and still reported by closeIntake.
    const guardedRead=async()=>{const s=await snapshot();authorizeSnapshot(s,baseline,{restoration:true});return s;};
    const r=await closeIntake({expected,readSnapshot:guardedRead,patch});
    return {...r,mode:'restore',windowId:baseline.windowId,restorationFingerprint:baseline.restorationFingerprint};
   };
   if(mode==='restore')Object.assign(receipt,await restore());
   else Object.assign(receipt,await openWindow({baseline,preflight:JSON.parse(readFileSync(resolve(extra),'utf8')),readSnapshot:snapshot,readInventory:async()=>(await readiness()).eligible,patch,restore,settleUncertain:()=>new Promise(resolveWait=>setTimeout(resolveWait,30000))}));
  }
 }catch{receipt.failure='Dev window operation refused or incomplete; inspect state and preserve guard';}
 finally{auth.token='';writeNew(receiptPath,receipt);}
 console.log(JSON.stringify(receipt,null,2));if(receipt.result!=='pass')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const mode=process.argv[2];const run=mode==='prepare'?main():withDevIntakeLock(mode==='open'?'open':'restore',process.argv[4]+'.lock.json',main);run.catch(()=>{console.error('Dev window unavailable; private output withheld');process.exitCode=1;});}
