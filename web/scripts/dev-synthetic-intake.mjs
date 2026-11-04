// Dev-only intake inspection and fail-closed restoration. No enable operation.
// Cloudflare settings PATCH supports inherit bindings; retain every other binding.
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync,existsSync,renameSync} from 'node:fs';
import {readdirSync} from 'node:fs';
import {withDevIntakeLock,assertDevIntakeLock,devIntakeSignal} from './dev-intake-lock.mjs';
export const DEV_ACCOUNT='1af65da586efd62d6f6d429240395f28';
export const DEV_DATABASE='54aca5df-2ae7-4150-bd75-0f6365e5bfa3';
export const CONTROLLED_FILERS=new Set(['8nu3dr3jMJJSQ28uHi6Q30mx6Gh018CJ','UZ3amYPVcdZePTjFsW8WYs0W5fVLyLjv','2y8xMkMQgjrYbQ79hBTEcpv5Cz5qqPzm','W3LaNDOQ16MRKgc394NYvKILajfUK55a','dI2mzF6Yq6290y8OLFuKBno9pq8euCIh','3Q0TazcUpC0LNMUq5jGOn1puX823qBaK','rzXE8PuCvsVdX0zEmjasoDd23LLVkrlT']);
export function intakeState(settings){
 const b=settings.bindings;if(!Array.isArray(b)||new Set(b.map(v=>v.name)).size!==b.length)throw Error('Duplicate or absent bindings');
 const named=n=>b.find(v=>v.name===n);
 if(named('DB')?.type!=='d1'||named('DB')?.id!==DEV_DATABASE||named('PROOFS')?.type!=='r2_bucket'||named('PROOFS')?.bucket_name!=='flag-proofs-dev'||named('BETTER_AUTH_URL')?.type!=='plain_text'||named('BETTER_AUTH_URL')?.text!=='https://flag-dev.factsfirst.workers.dev')throw Error('Exact dev target mismatch');
 const flag=named('PRIVATE_INTAKE_ENABLED');if(flag?.type!=='plain_text'||!['true','false'].includes(flag.text))throw Error('Invalid intake binding');
 return flag.text;
}
export function closedBindings(settings){
 intakeState(settings);return settings.bindings.map(b=>b.name==='PRIVATE_INTAKE_ENABLED'?{name:b.name,type:'plain_text',text:'false'}:{name:b.name,type:'inherit'});
}
export function containedEligible(rows){
 if(!rows.length||rows.some(r=>!CONTROLLED_FILERS.has(r.id)||r.current_policies!==3)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('Unknown globally eligible filer; keep intake false');
 return rows.map(r=>({id:r.id,currentPolicies:r.current_policies}));
}
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
const sortedBindings=s=>s.bindings.filter(b=>b.name!=='PRIVATE_INTAKE_ENABLED').sort((a,b)=>a.name.localeCompare(b.name));
const metadataKeys=['compatibility_date','compatibility_flags','observability','tail_consumers','logpush','limits','usage_model','placement'];
export function retainedMetadata(s){return {bindings:sortedBindings(s),...Object.fromEntries(metadataKeys.map(k=>[k,s[k]??null]))};}
export function sameRetainedMetadata(before,after){return stable(retainedMetadata(before))===stable(retainedMetadata(after));}
export function exactMigrationSet(ledger,sourceNames){if(stable(ledger.map(r=>r.name).sort())!==stable([...sourceNames].sort()))throw Error('Unexpected dev migration filename set');return ledger.map(r=>r.name);}
export function privacyReady(s){return s.observability?.logs?.invocation_logs===false&&s.observability?.logs?.persist===false&&s.observability?.traces?.enabled===false&&s.observability?.traces?.persist===false&&!(s.observability?.logs?.destinations?.length)&&!(s.observability?.traces?.destinations?.length)&&!(s.tail_consumers?.length)&&s.logpush!==true;}
export function alignedSource(settings,deployments,versions,version,expected){
 intakeState(settings);
 const d=[...deployments.deployments].sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
 const latest=[...versions.items].sort((a,b)=>b.number-a.number)[0];
 if(d?.versions?.length!==1||d.versions[0].percentage!==100||d.versions[0].version_id!==expected||latest?.id!==expected||version?.id!==expected)throw Error('Latest/current/deployed source is not a single reviewed version');
 if(stable([...settings.bindings].sort((a,b)=>a.name.localeCompare(b.name)))!==stable([...version.resources.bindings].sort((a,b)=>a.name.localeCompare(b.name))))throw Error('Current bindings differ from reviewed deployed version');
 const runtime=version.resources.script_runtime;
 if(!runtime||['compatibility_date','compatibility_flags'].some(k=>stable(settings[k]??null)!==stable(runtime[k]??null)))throw Error('Current compatibility differs from reviewed deployed version');
 return {deploymentId:d.id,versionId:expected,latestMatches:true,currentBindingsMatch:true,currentCompatibilityMatch:true,atomicSourcePin:false};
}
export function derivedSource(before,after){
 const previous=before.version,candidate=after.currentVersion??after.version;
 const source=alignedSource(after.settings,after.deployments,after.versions,candidate,candidate.id);
 const a=previous.resources.script,b=candidate.resources.script;
 const scriptIdentityPreserved=typeof a?.etag==='string'&&a.etag.length>0&&a.etag===b?.etag;
 const handlersPreserved=['handlers','named_handlers'].every(k=>stable(a?.[k]??null)===stable(b?.[k]??null));
 const runtimePreserved=stable(previous.resources.script_runtime)===stable(candidate.resources.script_runtime);
 const versionBindingMetadataPreserved=sameRetainedMetadata({bindings:previous.resources.bindings},{bindings:candidate.resources.bindings});
 const writableAnnotationsPreserved=['workers/message','workers/tag'].every(k=>stable(previous.annotations?.[k]??null)===stable(candidate.annotations?.[k]??null));
 if(!scriptIdentityPreserved||!handlersPreserved||!runtimePreserved||!versionBindingMetadataPreserved||!writableAnnotationsPreserved)throw Error('Derived version equivalence not established');
 return {...source,derivedVersion:candidate.id!==previous.id,scriptIdentityPreserved,handlersPreserved,runtimePreserved,versionBindingMetadataPreserved,writableAnnotationsPreserved};
}
export async function closeIntake({readSnapshot,patch,expected,force=false}){
 const receipt={mutationAttempted:false,confirmedState:'unknown',metadataPreserved:null,privacyDrift:false,result:'failed'};let before,sourceSnapshot;
 try{
  before=(await readSnapshot()).settings;receipt.confirmedState=intakeState(before);receipt.privacyDrift=!privacyReady(before);
  if(receipt.confirmedState==='false'&&!force){receipt.result='pass';return receipt;}
  const fresh=await readSnapshot();receipt.source=alignedSource(fresh.settings,fresh.deployments,fresh.versions,fresh.version,expected);
  sourceSnapshot=fresh;
  if(stable(before)!==stable(fresh.settings))throw Error('Settings changed before patch');
  const annotations=Object.fromEntries(['workers/message','workers/tag'].filter(k=>Object.hasOwn(fresh.version.annotations??{},k)).map(k=>[k,fresh.version.annotations[k]]));
  receipt.mutationAttempted=true;receipt.confirmedState='unknown';
  await patch({bindings:closedBindings(fresh.settings),annotations});
  receipt.patchResponseConfirmed=true;
 }catch{receipt.error='Operation refused or transport uncertain; readback required';}
 if(before){try{const after=await readSnapshot();receipt.confirmedState=intakeState(after.settings);receipt.metadataPreserved=sameRetainedMetadata(before,after.settings);receipt.privacyDrift||=!privacyReady(after.settings);if(receipt.mutationAttempted){try{receipt.derivedSource=derivedSource(sourceSnapshot,after);}catch{receipt.derivedSourceUnverified=true;}}if(receipt.confirmedState==='false'&&receipt.metadataPreserved&&receipt.patchResponseConfirmed&&receipt.derivedSource)receipt.result='pass';}catch{receipt.readbackFailed=true;receipt.confirmedState='unknown';}}
 return receipt;
}
async function main(){
 const [mode,receiptPath,expected]=process.argv.slice(2);if(!['review','close','test-inherit'].includes(mode)||!receiptPath||!(/^[a-f0-9-]{36}$/.test(expected??''))||process.argv.length!==5)throw Error('Use review|close|test-inherit, a new receipt path and exact reviewed version');
 const output=resolve(receiptPath);if(existsSync(output))throw Error('Preserve existing receipt');
 const web=resolve(import.meta.dirname,'..');
 const auth=JSON.parse(execFileSync(process.execPath,[resolve(web,'node_modules/wrangler/bin/wrangler.js'),'auth','token','--env','dev','--json'],{cwd:web,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:DEV_ACCOUNT,WRANGLER_WRITE_LOGS:'false',WRANGLER_SEND_METRICS:'false'},timeout:10000,stdio:['ignore','pipe','pipe']}));
 const headers={Authorization:'Bearer '+auth.token};
 const base='https://api.cloudflare.com/client/v4/accounts/'+DEV_ACCOUNT;
 async function api(path,init={}){receipt.lastOperation={method:init.method??'GET',path};if(mode!=='review')assertDevIntakeLock();const signal=mode==='review'?AbortSignal.timeout(20000):AbortSignal.any([AbortSignal.timeout(20000),devIntakeSignal()]);const r=await fetch(base+path,{...init,headers:{...headers,...init.headers},signal});const j=await r.json();if(!r.ok||!j.success){receipt.httpFailureStatus=r.status;throw Error('Dev operation unavailable');}return j.result;}
 const receipt={at:new Date().toISOString(),mode,worker:'flag-dev',mutationAttempted:false,confirmedState:'unknown'};
 async function readSnapshot(){const deployments=await api('/workers/scripts/flag-dev/deployments');const versions=await api('/workers/scripts/flag-dev/versions');const latestId=[...versions.items].sort((a,b)=>b.number-a.number)[0]?.id;receipt.observedSource={latestUploadedVersionId:latestId,deployedVersions:[...deployments.deployments].sort((a,b)=>b.created_on.localeCompare(a.created_on))[0]?.versions};const version=await api('/workers/scripts/flag-dev/versions/'+expected);const currentVersion=latestId===expected?version:await api('/workers/scripts/flag-dev/versions/'+latestId);const settings=await api('/workers/scripts/flag-dev/settings');return {settings,deployments,versions,version,currentVersion};}
 try{
  const before=await api('/workers/scripts/flag-dev/settings');receipt.intakeBefore=intakeState(before);
  if(mode!=='review'){
   if(mode==='test-inherit'&&receipt.intakeBefore!=='false')throw Error('Inheritance test requires disabled intake');
   const result=await closeIntake({readSnapshot,expected,force:mode==='test-inherit',patch:async settings=>{const form=new FormData();form.append('settings',new Blob([JSON.stringify(settings)],{type:'application/json'}));return api('/workers/scripts/flag-dev/settings',{method:'PATCH',body:form});}});
   Object.assign(receipt,result);if(result.result!=='pass')process.exitCode=1;
  }
  const after=await api('/workers/scripts/flag-dev/settings');receipt.intakeAfter=intakeState(after);
  receipt.confirmedState=receipt.intakeAfter;
  if(mode==='close'&&receipt.intakeAfter!=='false')throw Error('Intake false not confirmed');
  if(mode==='review'){
   if(receipt.intakeAfter!=='false')throw Error('Review requires disabled intake');
   if(!privacyReady(after))throw Error('Privacy observability drift; readiness refused');
   const snapshot=await readSnapshot();receipt.source=alignedSource(snapshot.settings,snapshot.deployments,snapshot.versions,snapshot.version,expected);
   const sql=`SELECT u.id,(SELECT count(DISTINCT p.policy) FROM policy_acceptance p JOIN current_policy_version c ON c.policy=p.policy AND c.version=p.version WHERE p.user_id=u.id AND p.retired_at IS NULL AND p.policy IN ('privacy','terms','freelancer_ack')) AS current_policies FROM user u JOIN freelancer_profile f ON f.user_id=u.id WHERE u.role='freelancer' AND u.banned=0 AND u.deactivated_at IS NULL AND f.status='verified' AND (SELECT count(DISTINCT p.policy) FROM policy_acceptance p JOIN current_policy_version c ON c.policy=p.policy AND c.version=p.version WHERE p.user_id=u.id AND p.retired_at IS NULL AND p.policy IN ('privacy','terms','freelancer_ack'))=3`;
   const rows=(await api('/d1/database/'+DEV_DATABASE+'/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql,params:[]})}))[0].results;
   receipt.eligible=containedEligible(rows);
   const ledger=(await api('/d1/database/'+DEV_DATABASE+'/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sql:'SELECT name FROM d1_migrations ORDER BY id',params:[]})}))[0].results;
   const sourceNames=readdirSync(resolve(web,'drizzle')).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
   receipt.migrations=exactMigrationSet(ledger,sourceNames);
   const deployments=await api('/workers/scripts/flag-dev/deployments');const d=deployments.deployments.sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];receipt.deployment={id:d.id,created_on:d.created_on,versions:d.versions};
   receipt.bindingNames=after.bindings.map(b=>({name:b.name,type:b.type}));receipt.observability=after.observability;
  }
  receipt.result??='pass';if(mode==='review')receipt.result='pass';
 }catch(error){receipt.result='failed';receipt.failure='Dev intake operation incomplete; inspect actual state before retry';receipt.failureKind=['Latest/current/deployed source is not a single reviewed version','Current bindings differ from reviewed deployed version','Current compatibility differs from reviewed deployed version','Privacy observability drift; readiness refused','Unexpected dev migration filename set','Dev operation unavailable'].includes(error.message)?error.message:'Transport or local guard failure';process.exitCode=1;}
 finally{auth.token='';headers.Authorization='';const partial=output+'.partial';writeFileSync(partial,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});renameSync(partial,output);}
 console.log(JSON.stringify(receipt,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const run=process.argv[2]==='review'?main():withDevIntakeLock('close',process.argv[3]+'.lock.json',main);run.catch(()=>{console.error('Dev intake operation unavailable; private output withheld');process.exitCode=1;});}
