import { applyD1Migrations, reset } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { addTwelveMonthsUtc } from "@/features/lifecycle/calendar";
import { POLICY_VERSIONS } from "@/lib/policies";

// Only the local test binding, never a configured Wrangler database.
const db = env.MIGRATION_DB;
const old = env.TEST_MIGRATIONS.filter(m => m.name < "0010");
const run = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args).run();
const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
async function snapshot() {
  const schema = (await db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all()).results;
  const data: Record<string, Record<string, unknown>[]> = {};
  for (const row of schema.filter(s => s.type === "table")) data[String(row.name)] = (await db.prepare(`SELECT * FROM "${String(row.name).replaceAll('"', '""')}"`).all()).results.toSorted((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { schema, data };
}
async function healthy() {
  expect((await db.prepare("PRAGMA foreign_keys").first())?.foreign_keys).toBe(1);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
}
async function seedOld(beforeIntake = false, caseCreatedAt: string | null = null) {
  await reset();
  await applyD1Migrations(db, beforeIntake ? old.filter(m => m.name < '0009') : old);
  await run("INSERT INTO user(id,name,email,role) VALUES('f','Synthetic Filer','f@example.invalid','freelancer'),('c','Synthetic Client','c@example.invalid','client'),('m','Synthetic Reviewer','m@example.invalid','moderator'),('a','Synthetic Processor','a@example.invalid','admin')");
  await run("INSERT INTO freelancer_profile(user_id,display_name,status) VALUES('f','Synthetic Filer','verified')");
  await run("INSERT INTO client_profile(id,user_id,display_name,kind) VALUES('c','c','Synthetic Client','individual')");
  for (const id of ['f','c','m','a']) for (const policy of ['privacy','terms'] as const) await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,?,?,?)",`${id}-${policy}`,id,policy,POLICY_VERSIONS[policy]);
  await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES('legacy-privacy','f','privacy','2026-11-01')");
  await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES('ack','f','freelancer_ack','2026-10-12')");
  await run("INSERT INTO engagement(id,freelancer_id,title,client_name_hint,started_on,invite_token_hash,invite_expires_at) VALUES('e','f','Synthetic work','Synthetic Client','2026-01-01','invite',strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))");
  await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES('consent','c','client_consent','2026-10-12')");
  await run("INSERT INTO engagement_consent(engagement_id,policy_acceptance_id) VALUES('e','consent')");
  await run("INSERT INTO engagement_log(id,ref,engagement_id,freelancer_id,client_id,anchor_kind,anchor_date) VALUES('l','FL-1042','e','f','c','completed',date('now','+8 hours'))");
  await run("INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by) VALUES('r','l',1,'initial',5,'positive','The synthetic invoice was paid in full after the work was delivered.','2026-01-01','2026-01-02','f')");
  await run("INSERT INTO log_tag(revision_id,tag) VALUES('r','On-time Payment')");
  await run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256) VALUES('p','l','filer','f','synthetic/proof','invoice','application/pdf',32,?)",'a'.repeat(64));
  await run("UPDATE proof_file SET status='attached',revision_id='r' WHERE id='p'");
  await run(`INSERT INTO moderation_case(id,kind,subject_id,created_at) VALUES('lc','log','l',coalesce(?,${now}))`,caseCreatedAt);
  await run(`UPDATE engagement_log SET status='pending',first_submitted_at=${now},submitted_at=${now} WHERE id='l'`);
  // Real legacy unknown history remains NULL, with a genuine stored decision.
  await run("INSERT INTO verification_case(id,freelancer_id,reviewer_id,id_kind,result,name_match,inspected_at,decision,reason,decided_at,created_at) VALUES('vc','f','m','passport','pass',1,'2026-10-01T00:00:00.000Z','approve','Synthetic inspection','2026-10-01T00:00:00.000Z','2026-09-30T00:00:00.000Z')");
  await run("INSERT INTO moderation_case(id,kind,subject_id,status,decision,reason,decided_by,decided_at) VALUES('vcm','verification','vc','decided','approve','Synthetic inspection','m','2026-10-01T00:00:00.000Z')");
  await run("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id) VALUES('audit','m','verification_decided','verification_case','vc')");
  await run("INSERT INTO auth_rate_limit(key,count,expires_at) VALUES('log-reference-sequence',9000,9007199254740991)");
  await run("INSERT INTO session(id,user_id,token,expires_at) VALUES('s','f','synthetic-token','2027-01-01T00:00:00.000Z')");
  await run("INSERT INTO account(id,user_id,provider_id,account_id) VALUES('credential','f','credential','f')");
}

describe('pilot populated migration', () => {
  it('compiles every forward migration statement on D1', async () => {
    await seedOld();
    for (const migration of env.TEST_MIGRATIONS.filter(m => m.name >= '0010')) {
      for (let i=0; i<migration.queries.length; i++) {
        try { await db.prepare(migration.queries[i]).run(); }
        catch (error) { throw new Error(`${migration.name} statement ${i}: ${migration.queries[i].slice(0,120)}`, {cause:error}); }
      }
    }
    await healthy();
  });
  it('preserves all legacy columns, consent, unknown history and reference high-water', async () => {
    await seedOld(); const before = await snapshot();
    await applyD1Migrations(db, env.TEST_MIGRATIONS); await healthy();
    const after = await snapshot();
    for (const [table, rows] of Object.entries(before.data)) {
      if (table === 'd1_migrations') continue;
      expect(after.data[table].map(row => Object.fromEntries(Object.keys(rows[0] ?? {}).map(key => [key,row[key]])))).toEqual(rows);
    }
    expect(await db.prepare("SELECT closed_at,closure_kind FROM moderation_case WHERE id='vcm'").first()).toEqual({closed_at:'2026-10-01T00:00:00.000Z',closure_kind:'decision'});
    expect(await db.prepare("SELECT submitted_profile FROM verification_case WHERE id='vc'").first()).toEqual({submitted_profile:null});
    expect(await db.prepare("SELECT state,moderation_case_id FROM log_revision WHERE id='r'").first()).toEqual({state:'submitted',moderation_case_id:'lc'});
    expect((await db.prepare('SELECT * FROM revision_proof').all()).results).toEqual([{revision_id:'r',proof_id:'p'}]);
    const stable = await snapshot(); await applyD1Migrations(db, env.TEST_MIGRATIONS); expect(await snapshot()).toEqual(stable);
  });
  it('rolls back a failure after the populated rebuild including ledger, schema, data and triggers', async () => {
    await seedOld(); const before = await snapshot();
    const next = env.TEST_MIGRATIONS.find(m => m.name.startsWith('0010'))!;
    await expect(applyD1Migrations(db,[...old,{...next,queries:[...next.queries,"INSERT INTO user(id,name,email) VALUES('bad','Synthetic','f@example.invalid')"]}])).rejects.toThrow();
    expect(await snapshot()).toEqual(before); await healthy();
    await expect(run("UPDATE log_revision SET facts='tampered' WHERE id='r'")).rejects.toThrow(/frozen/i);
  });
  it('rolls back failed trigger replacement without leaving a weaker ordinary-write interval', async () => {
    await seedOld();
    await applyD1Migrations(db,env.TEST_MIGRATIONS.filter(m=>m.name<'0011'));
    const before=await snapshot(),next=env.TEST_MIGRATIONS.find(m=>m.name.startsWith('0011'))!;
    await expect(applyD1Migrations(db,[...env.TEST_MIGRATIONS.filter(m=>m.name<'0011'),{...next,queries:[...next.queries,"INSERT INTO user(id,name,email) VALUES('bad-trigger-replacement','Synthetic','f@example.invalid')"]}])).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
    await expect(run("UPDATE log_revision SET facts='tampered' WHERE id='r'")).rejects.toThrow(/frozen/i);
    await healthy();
  });
});

describe('calendar retention', () => {
  it.each([
    ['2024-02-29T23:59:59.123Z','2025-02-28T23:59:59.123Z'],
    ['2023-02-28T00:00:00.000Z','2024-02-28T00:00:00.000Z'],
    ['2026-11-02T00:00:00.000Z','2027-11-02T00:00:00.000Z'],
    ['0099-12-31T01:02:03.004Z','0100-12-31T01:02:03.004Z'],
  ])('clamps UTC anniversary %s', (input,output) => expect(addTwelveMonthsUtc(input)).toBe(output));
  it('rejects invalid timestamps', () => expect(() => addTwelveMonthsUtc('invalid')).toThrow(RangeError));
});

async function migrated() { await seedOld(); await applyD1Migrations(db,env.TEST_MIGRATIONS); }
async function claim(caseId='lc', actor='m') {
  await run(`UPDATE moderation_case SET status='claimed',claimed_by=?,claimed_until=strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 minutes') WHERE id=?`,actor,caseId);
}
async function initialDecision(decision='approve', includeReceipt=true) {
  await claim();
  const time = (await db.prepare(`SELECT ${now} AS value`).first<{value:string}>())!.value;
  const batch=[db.prepare("INSERT INTO review_round(id,case_id,round_no,revision_id,reviewer_id,decision,reason,decided_at) VALUES('round','lc',1,'r','m',?,'Synthetic review grounds',?)").bind(decision,time)];
  if(includeReceipt) batch.push(db.prepare("INSERT INTO proof_review(id,round_id,proof_id,proof_sha256,verdict,reason,reviewed_at) VALUES('verdict','round','p',?,'accepted','Synthetic byte review',?)").bind('a'.repeat(64),time));
  batch.push(db.prepare("UPDATE log_revision SET decision=?,reason='Synthetic review grounds',decided_by='m',decided_at=? WHERE id='r'").bind(decision,time));
  if(decision==='approve') batch.push(db.prepare("UPDATE engagement_log SET status='published',current_revision_id='r',published_at=?,expires_at=? WHERE id='l'").bind(time,addTwelveMonthsUtc(time)));
  else batch.push(db.prepare("UPDATE engagement_log SET status=? WHERE id='l'").bind(decision==='ask_changes'?'ask_changes':'rejected'));
  batch.push(db.prepare("UPDATE moderation_case SET status=?,claimed_by=NULL,claimed_until=NULL,decision=?,reason=?,decided_by=?,decided_at=?,closed_at=?,closure_kind=? WHERE id='lc'").bind(decision==='ask_changes'?'awaiting_changes':'decided',decision==='ask_changes'?null:decision,decision==='ask_changes'?null:'Synthetic review grounds',decision==='ask_changes'?null:'m',decision==='ask_changes'?null:time,decision==='ask_changes'?null:time,decision==='ask_changes'?null:'decision'));
  await db.batch(batch);
}
async function assessed(targetType:string,targetId:string,operation='purge',basis='assessed_erasure') {
  const request=crypto.randomUUID(),task=crypto.randomUUID(),dueAt=new Date(Date.now()-1000).toISOString();
  const target={targetType,targetId,operation,dueAt};
  await run(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope) VALUES(?,'f','a',?,${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),?)`,request,basis==='account_closure'?'closure':'deletion',JSON.stringify({targets:[target]}));
  await run(`UPDATE privacy_request SET status='executing',identity_verified_at=${now},assessed_at=${now},assessment=? WHERE id=?`,JSON.stringify({targets:[{...target,basis}]}),request);
  await run(`INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES(?,?,'a',?,?,?,?,?,${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`,task,request,targetType,targetId,operation,basis,dueAt);
  await run(`UPDATE maintenance_task SET status='claimed',claimed_at=${now},attempts=attempts+1 WHERE id=?`,task);
  return {request,task};
}
async function scheduled(targetType:string,targetId:string) {
  const task=crypto.randomUUID();
  await run(`INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) SELECT ?,target_type,target_id,'purge','retention_due',purge_due_at,${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour') FROM pilot_maintenance_target WHERE target_type=? AND target_id=?`,task,targetType,targetId);
  await run(`UPDATE maintenance_task SET status='claimed',claimed_at=${now},attempts=attempts+1 WHERE id=?`,task);
  return task;
}

describe('pilot ordinary and maintenance SQL authority',()=>{
  it('matches the current application policies and freezes ordinary authority changes',async()=>{
    await migrated();
    expect(Object.fromEntries((await db.prepare('SELECT policy,version FROM current_policy_version').all<{policy:string;version:string}>()).results.map(r=>[r.policy,r.version]))).toEqual(POLICY_VERSIONS);
    await expect(run("UPDATE current_policy_version SET version='forged'")).rejects.toThrow(/forward migration/);
    await expect(run("DELETE FROM current_policy_version")).rejects.toThrow(/forward migration/);
  });
  it('rejects publication without a human round and freezes submitted content, bytes and evidence',async()=>{
    await migrated();
    for(const sql of ["UPDATE engagement_log SET status='published',current_revision_id='r' WHERE id='l'","UPDATE log_revision SET rating=1,outcome='negative' WHERE id='r'","UPDATE proof_file SET sha256='forged' WHERE id='p'","DELETE FROM log_tag WHERE revision_id='r'","UPDATE log_revision SET state='draft' WHERE id='r'","DELETE FROM revision_proof WHERE revision_id='r'","UPDATE engagement_log SET anchor_date='2026-01-01' WHERE id='l'"]) await expect(run(sql)).rejects.toThrow();
  });
  it('requires every exact proof verdict and atomically rolls back a missing receipt',async()=>{
    await migrated();
    await expect(initialDecision('approve',false)).rejects.toThrow();
    expect((await db.prepare('SELECT * FROM review_round').all()).results).toEqual([]);
    expect((await db.prepare("SELECT status FROM engagement_log WHERE id='l'").first())?.status).toBe('pending');
    await initialDecision();
    expect((await db.prepare("SELECT status,current_revision_id FROM engagement_log WHERE id='l'").first())).toEqual({status:'published',current_revision_id:'r'});
    for(const sql of ["UPDATE review_round SET reason='forged' WHERE id='round'","UPDATE proof_review SET proof_sha256='forged' WHERE id='verdict'","UPDATE log_revision SET decision='reject' WHERE id='r'","UPDATE engagement_log SET expires_at='2099-01-01T00:00:00.000Z' WHERE id='l'","DELETE FROM review_round WHERE id='round'"]) await expect(run(sql)).rejects.toThrow();
    await healthy();
  });
  it('rechecks current staff, policy, conflicts and proof byte identity',async()=>{
    await migrated();
    await run("UPDATE user SET role='admin' WHERE id='m'"); await expect(claim()).rejects.toThrow();
    await run("UPDATE user SET role='moderator',banned=1 WHERE id='m'"); await expect(claim()).rejects.toThrow();
    await run("UPDATE user SET banned=0 WHERE id='m'"); await claim();
    await run("UPDATE user SET banned=1 WHERE id='m'");
    await expect(run(`INSERT INTO review_round(id,case_id,round_no,revision_id,reviewer_id,decision,reason,decided_at) VALUES('bad','lc',1,'r','m','approve','Synthetic',${now})`)).rejects.toThrow();
    await run("UPDATE user SET banned=0 WHERE id='m'");
    await run(`INSERT INTO review_round(id,case_id,round_no,revision_id,reviewer_id,decision,reason,decided_at) VALUES('round','lc',1,'r','m','approve','Synthetic',${now})`);
    await expect(run(`INSERT INTO proof_review(id,round_id,proof_id,proof_sha256,verdict,reason,reviewed_at) VALUES('bad','round','p','wrong','accepted','Synthetic',${now})`)).rejects.toThrow();
  });
  it('retains original filing clock across ask-changes and uses a new immutable round',async()=>{
    await migrated(); const original=await db.prepare("SELECT first_submitted_at,anchor_date FROM engagement_log WHERE id='l'").first();
    await initialDecision('ask_changes');
    await run("INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by,moderation_case_id) VALUES('r2','l',2,'initial',4,'positive','The corrected synthetic project details explain the paid invoice.','2026-01-01','2026-01-02','f','lc')");
    await run("INSERT INTO log_tag(revision_id,tag) VALUES('r2','On-time Payment')");
    await run("INSERT INTO revision_proof(revision_id,proof_id) VALUES('r2','p')");
    await run("UPDATE moderation_case SET status='open' WHERE id='lc'");
    await run(`UPDATE log_revision SET state='submitted',submitted_at=${now} WHERE id='r2'`);
    await run(`UPDATE engagement_log SET status='pending',submitted_at=${now} WHERE id='l'`);
    expect(await db.prepare("SELECT first_submitted_at,anchor_date FROM engagement_log WHERE id='l'").first()).toEqual(original);
    expect((await db.prepare("SELECT decision,state FROM log_revision WHERE id='r'").first())).toEqual({decision:'ask_changes',state:'submitted'});
  });
  it('requires exact assessed grant, rejects forgery, and rechecks actor at destructive use',async()=>{
    await migrated();
    await expect(run(`INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('forged','engagement_log','l','purge','retention_due',${now},${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`)).rejects.toThrow();
    const {task}=await assessed('engagement_log','l');
    await expect(run("UPDATE maintenance_task SET target_id='other' WHERE id=?",task)).rejects.toThrow();
    await run("UPDATE user SET banned=1 WHERE id='a'");
    await expect(run("DELETE FROM engagement_log WHERE id='l'")).rejects.toThrow();
    await run("UPDATE user SET banned=0 WHERE id='a'");
    await expect(run("UPDATE engagement_log SET anchor_date='2026-01-01' WHERE id='l'")).rejects.toThrow();
    await expect(run("INSERT INTO retention_hold(id,target_type,target_id,kind,responsible_id,reason,placed_at,review_due_at,expires_at) VALUES('late','log','l','legal','m','Synthetic',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))")).rejects.toThrow(/claimed/);
  });
  it('deactivates under an exact grant and denies session/credential resurrection while permitting revocation',async()=>{
    await migrated(); await assessed('user','f','redact_identity','account_closure');
    await run(`UPDATE user SET deactivated_at=${now} WHERE id='f'`);
    await expect(run("INSERT INTO session(id,user_id,token,expires_at) VALUES('bad','f','bad','2027-01-01')")).rejects.toThrow();
    await expect(run("UPDATE account SET account_id='resurrected' WHERE id='credential'")).rejects.toThrow();
    await expect(run("UPDATE user SET deactivated_at=NULL WHERE id='f'")).rejects.toThrow();
    await run("DELETE FROM session WHERE user_id='f'"); await run("DELETE FROM account WHERE user_id='f'");
    await healthy();
  });
});

async function expiredParent() {
  await seedOld(true);
  // Synthetic historical publication admitted by the actual pre-intake schema.
  await run("UPDATE log_revision SET decision='approve',reason='Synthetic historical review',decided_by='m',decided_at='2025-10-01T00:00:00.000Z' WHERE id='r'");
  await run("UPDATE engagement_log SET status='published',current_revision_id='r',published_at='2025-10-01T00:00:00.000Z',expires_at='2026-10-01T00:00:00.000Z' WHERE id='l'");
  await run("UPDATE moderation_case SET status='claimed',claimed_by='m',claimed_until='2025-10-01T00:30:00.000Z' WHERE id='lc'");
  await run("UPDATE moderation_case SET status='decided',claimed_by=NULL,claimed_until=NULL,decision='approve',reason='Synthetic historical review',decided_by='m',decided_at='2025-10-01T00:00:00.000Z' WHERE id='lc'");
  await applyD1Migrations(db,env.TEST_MIGRATIONS.filter(m=>m.name<'0011'));
  // A later real-case clock is independent of parent publication expiry.
  await run("INSERT INTO correction_request(id,log_id,subject_ref,requested_by,base_revision_id,status,new_evidence_note,created_at,updated_at,submitted_at,closed_at) VALUES('q','l','l','c','r','closed','Synthetic later evidence','2026-09-30T00:00:00.000Z','2026-10-01T00:00:00.000Z','2026-09-30T00:00:00.000Z','2026-10-01T00:00:00.000Z')");
  await run("INSERT INTO moderation_case(id,kind,subject_id,status,log_id,correction_request_id,closed_at,closure_kind) VALUES('qc','correction','q','closed','l','q','2026-10-01T00:00:00.000Z','erased')");
  await applyD1Migrations(db,env.TEST_MIGRATIONS);
}

describe('pilot physical erasure dependencies',()=>{
  it('retains late correction history while deleting expired parent, current-pointer cycle and proof metadata',async()=>{
    await expiredParent();
    await expect(run("UPDATE correction_request SET log_id=NULL WHERE id='q'")).rejects.toThrow();
    const logTask=await scheduled('engagement_log','l'); await scheduled('log_revision','r'); await scheduled('proof_file','p');
    await expect(run("DELETE FROM proof_file WHERE id='p'")).rejects.toThrow(/confirmed purged/);
    await run("UPDATE engagement_log SET status='expired',current_revision_id=NULL WHERE id='l'");
    await run("UPDATE correction_request SET base_revision_id=NULL WHERE id='q'");
    await run("UPDATE correction_request SET log_id=NULL WHERE id='q'");
    await run("UPDATE moderation_case SET log_id=NULL WHERE id IN ('qc','lc')");
    await run("DELETE FROM revision_proof WHERE revision_id='r'");
    await run("UPDATE proof_file SET status='pending_purge' WHERE id='p'");
    await run("UPDATE proof_file SET purge_attempts=purge_attempts+1,purge_inflight=1 WHERE id='p'");
    // Models confirmed R2 removal; the runtime runner owns the actual R2 call.
    await run("UPDATE proof_file SET status='purged',purge_inflight=0 WHERE id='p'");
    await run("DELETE FROM proof_file WHERE id='p'");
    await run("DELETE FROM log_tag WHERE revision_id='r'"); await run("DELETE FROM log_revision WHERE id='r'");
    await run("DELETE FROM engagement_log WHERE id='l'");
    expect(await db.prepare("SELECT log_id,base_revision_id,subject_ref,closed_at FROM correction_request WHERE id='q'").first()).toEqual({log_id:null,base_revision_id:null,subject_ref:'l',closed_at:'2026-10-01T00:00:00.000Z'});
    expect((await db.prepare("SELECT status FROM maintenance_task WHERE id=?").bind(logTask).first())?.status).toBe('completed');
    await expect(run("DELETE FROM correction_request WHERE id='q'")).rejects.toThrow();
    await healthy();
  });
  it('enforces exact-object holds and deterministic parent-log inheritance at issue and use',async()=>{
    await expiredParent();
    await run(`INSERT INTO retention_hold(id,target_type,target_id,kind,responsible_id,reason,placed_at,review_due_at,expires_at) VALUES('h','proof','p','legal','m','Synthetic exact scope',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))`);
    await expect(scheduled('proof_file','p')).rejects.toThrow();
    // A proof hold does not extend independent correction visibility/history or authorize parent deletion.
    expect((await db.prepare("SELECT * FROM pilot_unheld_target WHERE target_type='correction_request' AND target_id='q'").all()).results).toHaveLength(1);
    await run(`UPDATE retention_hold SET released_at=${now} WHERE id='h'`);
    await scheduled('proof_file','p');
    await expect(run(`INSERT INTO retention_hold(id,target_type,target_id,kind,responsible_id,reason,placed_at,review_due_at,expires_at) VALUES('late-revision','revision','r','legal','m','Synthetic dependent purpose',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))`)).rejects.toThrow(/claimed/);
    await expect(run(`INSERT INTO retention_hold(id,target_type,target_id,kind,responsible_id,reason,placed_at,review_due_at,expires_at) VALUES('late','proof','p','legal','m','Synthetic',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'),strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'))`)).rejects.toThrow(/claimed/);
    await expect(run("UPDATE retention_hold SET expires_at='2099-01-01' WHERE id='h'")).rejects.toThrow();
  });
  it('permits bounded compensation to finish its own inflight proof without touching shared submitted bytes',async()=>{
    await migrated(); await initialDecision();
    await run("INSERT INTO correction_request(id,log_id,subject_ref,requested_by,base_revision_id,new_evidence_note) VALUES('draft-q','l','l','c','r','Synthetic new evidence')");
    await run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,correction_request_id) VALUES('unsubmitted','l','client','c','synthetic/private-new','chat','application/pdf',32,?,'draft-q')",'b'.repeat(64));
    await run("UPDATE proof_file SET status='pending_purge' WHERE id='unsubmitted'");
    await run("UPDATE proof_file SET purge_attempts=1,purge_inflight=1 WHERE id='unsubmitted'");
    await expect(run("UPDATE proof_file SET purge_inflight=1,purge_attempts=2 WHERE id='unsubmitted'")).rejects.toThrow();
    await run("UPDATE proof_file SET status='purged',purge_inflight=0 WHERE id='unsubmitted'");
    await run("DELETE FROM proof_file WHERE id='unsubmitted'");
    await expect(run("UPDATE proof_file SET status='pending_purge' WHERE id='p'")).rejects.toThrow();
    await healthy();
  });
});

describe('private correction active counterproof selection',()=>{
  it('validates exact owned unique bounded IDs, permits saturated replacement, and freezes submitted selection and original note',async()=>{
    await migrated(); await initialDecision();
    await run("INSERT INTO correction_request(id,log_id,subject_ref,requested_by,base_revision_id,new_evidence_note) VALUES('q','l','l','c','r','Synthetic new counterproof')");
    for(let i=0;i<5;i++) {
      await run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,correction_request_id) VALUES(?,'l','client','c',?,'chat','application/pdf',32,?,'q')",`counter-${i}`,`synthetic/counter-${i}`,String(i).repeat(64));
      await run("UPDATE correction_request SET active_proof_ids=json_insert(active_proof_ids,'$[#]',?) WHERE id='q'",`counter-${i}`);
      await run("UPDATE proof_file SET status='attached' WHERE id=?",`counter-${i}`);
    }
    for(const selection of [['p'],['missing'],['counter-0','counter-0'],['counter-0','counter-1','counter-2','counter-3','counter-4','counter-0'],[1]]) await expect(run("UPDATE correction_request SET active_proof_ids=? WHERE id='q'",JSON.stringify(selection))).rejects.toThrow();
    await run("INSERT INTO moderation_case(id,kind,subject_id,log_id,correction_request_id) VALUES('qc','correction','q','l','q')");
    await run(`UPDATE correction_request SET status='submitted',submitted_at=${now},updated_at=${now} WHERE id='q'`);
    await expect(run("UPDATE correction_request SET active_proof_ids='[]' WHERE id='q'")).rejects.toThrow();
    await expect(claim('qc','m')).rejects.toThrow(); // original publication reviewer is excluded
    await run("INSERT INTO user(id,name,email,role) VALUES('independent','Synthetic Independent','independent@example.invalid','moderator')");
    for(const policy of ['privacy','terms'] as const) await run("INSERT INTO policy_acceptance(id,user_id,policy,version) VALUES(?,'independent',?,?)",`independent-${policy}`,policy,POLICY_VERSIONS[policy]);
    await claim('qc','independent');
    const time=(await db.prepare(`SELECT ${now} AS value`).first<{value:string}>())!.value;
    await run("INSERT INTO review_round(id,case_id,round_no,revision_id,reviewer_id,decision,reason,decided_at) VALUES('q-round','qc',1,'r','independent','ask_changes','Synthetic evidence incomplete',?)",time);
    for(const [id,hash] of [['p','a'.repeat(64)],...Array.from({length:5},(_,i)=>[`counter-${i}`,String(i).repeat(64)])]) await run("INSERT INTO proof_review(id,round_id,proof_id,proof_sha256,verdict,reason,reviewed_at) VALUES(?,'q-round',?,?,'accepted','Synthetic review',?)",`receipt-${id}`,id,hash,time);
    await run(`UPDATE correction_request SET status='ask_changes',updated_at=${now} WHERE id='q'`);
    await run("UPDATE moderation_case SET status='awaiting_changes',claimed_by=NULL,claimed_until=NULL WHERE id='qc'");
    await expect(run("UPDATE correction_request SET new_evidence_note='rewritten history' WHERE id='q'")).rejects.toThrow();
    await run("UPDATE correction_request SET active_proof_ids=? WHERE id='q'",JSON.stringify(['counter-1','counter-2','counter-3','counter-4']));
    await run("INSERT INTO proof_file(id,log_id,owner_kind,uploaded_by,object_key,kind,mime,size_bytes,sha256,correction_request_id) VALUES('replacement','l','client','c','synthetic/replacement','chat','application/pdf',32,?,'q')",'f'.repeat(64));
    await run("UPDATE correction_request SET active_proof_ids=json_insert(active_proof_ids,'$[#]','replacement') WHERE id='q'");
    await expect(run("UPDATE proof_file SET status='pending_purge' WHERE id='counter-0'")).rejects.toThrow();
    expect((await db.prepare("SELECT count(*) AS n FROM proof_review WHERE round_id='q-round'").first())?.n).toBe(6);
    await healthy();
  });
});

describe('pilot due predicates and expired assessment grants', () => {
  it('rejects assessed unrelated targets and rechecks the surviving subject link at destructive use', async () => {
    await migrated();
    await expect(assessed('user','c','redact_identity')).rejects.toThrow(/unassessed/);
    expect(await db.prepare("SELECT deactivated_at FROM user WHERE id='c'").first()).toEqual({deactivated_at:null});
    await initialDecision();
    await run("INSERT INTO audit_event(id,actor_id,action,subject_type,subject_id,moderation_case_id) VALUES('case-audit','m','synthetic_review','moderation_case','lc','lc')");
    const {task}=await assessed('audit_event','case-audit');
    expect(await db.prepare('SELECT id FROM pilot_maintenance_eligible WHERE id=?').bind(task).first()).toEqual({id:task});
    await assessed('engagement_log','l');
    await run("UPDATE moderation_case SET log_id=NULL WHERE id='lc'");
    expect(await db.prepare('SELECT id FROM pilot_maintenance_eligible WHERE id=?').bind(task).first()).toBeNull();
    await expect(run("DELETE FROM audit_event WHERE id='case-audit'")).rejects.toThrow(/exact claimed/);
    await healthy();
  });
  it('excludes a genuine legacy original publication reviewer without inventing missing round history', async () => {
    await seedOld(true);
    const time=new Date(Date.now()-1000).toISOString();
    await run("UPDATE log_revision SET decision='approve',reason='Synthetic genuine legacy review',decided_by='m',decided_at=? WHERE id='r'",time);
    await run("UPDATE engagement_log SET status='published',current_revision_id='r',published_at=?,expires_at=? WHERE id='l'",time,addTwelveMonthsUtc(time));
    await run("UPDATE moderation_case SET status='claimed',claimed_by='m',claimed_until=? WHERE id='lc'",new Date(Date.now()+100000).toISOString());
    await run("UPDATE moderation_case SET status='decided',claimed_by=NULL,claimed_until=NULL,decision='approve',reason='Synthetic genuine legacy review',decided_by='m',decided_at=? WHERE id='lc'",time);
    await applyD1Migrations(db,env.TEST_MIGRATIONS);
    await run("INSERT INTO correction_request(id,log_id,subject_ref,requested_by,base_revision_id,new_evidence_note) VALUES('legacy-q','l','l','c','r','Synthetic counterproof')");
    await run("INSERT INTO moderation_case(id,kind,subject_id,log_id,correction_request_id) VALUES('legacy-qc','correction','legacy-q','l','legacy-q')");
    expect((await db.prepare('SELECT * FROM review_round').all()).results).toEqual([]);
    expect((await db.prepare("SELECT reviewer_id FROM pilot_case_reviewer WHERE case_id='legacy-qc'").all()).results).toEqual([]);
    await expect(claim('legacy-qc','m')).rejects.toThrow();
    await healthy();
  });
  it('releases only a settled unchanged proof fence under its still-claimed task after staff revocation', async () => {
    await migrated();
    await assessed('log_revision','r');
    const {task}=await assessed('proof_file','p');
    await run("UPDATE proof_file SET status='pending_purge' WHERE id='p'");
    await run("UPDATE proof_file SET purge_inflight=1,purge_attempts=1 WHERE id='p'");
    await run("UPDATE user SET banned=1 WHERE id='a'");
    await expect(run("UPDATE proof_file SET purge_inflight=0,sha256=? WHERE id='p'",'b'.repeat(64))).rejects.toThrow(/immutable/);
    await expect(run("UPDATE proof_file SET purge_inflight=0,purge_attempts=2 WHERE id='p'")).rejects.toThrow();
    await expect(run("UPDATE proof_file SET purge_inflight=0,status='purged' WHERE id='p'")).rejects.toThrow();
    await run("UPDATE maintenance_task SET status='blocked' WHERE id=?",task);
    await expect(run("UPDATE proof_file SET purge_inflight=0 WHERE id='p'")).rejects.toThrow();
    await run("UPDATE user SET banned=0 WHERE id='a'");
    await run("UPDATE maintenance_task SET status='planned',claimed_at=NULL WHERE id=?",task);
    await run(`UPDATE maintenance_task SET status='claimed',claimed_at=${now},attempts=attempts+1 WHERE id=?`,task);
    await run("UPDATE user SET banned=1 WHERE id='a'");
    await run("UPDATE proof_file SET purge_inflight=0 WHERE id='p'");
    expect(await db.prepare("SELECT status,purge_inflight,purge_attempts,sha256 FROM proof_file WHERE id='p'").first()).toEqual({status:'pending_purge',purge_inflight:0,purge_attempts:1,sha256:'a'.repeat(64)});
    await expect(run("DELETE FROM proof_file WHERE id='p'")).rejects.toThrow();
    await healthy();
  });

  it.each(['consumed','revoked'])('makes %s export bytes immediately due and retains the minimal receipt on its request clock', async mode => {
    await migrated();
    await run(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope) VALUES('export-request','f','a','export',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),'{}')`);
    await run(`UPDATE privacy_request SET status='executing',scope='{"targets":[]}',assessment='{"targets":[]}',identity_verified_at=${now},assessed_at=${now} WHERE id='export-request'`);
    const created=new Date(Date.now()-1000).toISOString(),expiry=new Date(Date.now()+3600000).toISOString();
    await run("INSERT INTO export_delivery(id,privacy_request_id,auth_kind,object_key,token_hash,created_at,expires_at) VALUES('delivery','export-request','session','synthetic/export',?,?,?)",'f'.repeat(64),created,expiry);
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='export_delivery' AND target_id='delivery'").first()).toEqual({purge_due_at:expiry});
    await expect(scheduled('export_delivery','delivery')).rejects.toThrow();
    if(mode==='consumed') await run(`UPDATE export_delivery SET token_hash=NULL,downloaded_at=${now} WHERE id='delivery'`);
    else await run("UPDATE export_delivery SET token_hash=NULL WHERE id='delivery'");
    const due=await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='export_delivery' AND target_id='delivery'").first<{purge_due_at:string}>();
    expect(Date.parse(due!.purge_due_at)).toBeLessThanOrEqual(Date.now());
    await expect(run(`INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('forged-export','export_delivery','delivery','purge','retention_due',strftime('%Y-%m-%dT%H:%M:%fZ','now','-0.5 second'),${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`)).rejects.toThrow();
    const task=await scheduled('export_delivery','delivery');
    await run(`UPDATE export_delivery SET object_key=NULL,token_hash=NULL,purged_at=${now} WHERE id='delivery'`);
    const completed=(await db.prepare(`SELECT ${now} AS value`).first<{value:string}>())!.value;
    await run("UPDATE maintenance_task SET status='completed',completed_at=?,retain_until=? WHERE id=?",completed,addTwelveMonthsUtc(completed),task);
    await expect(run("UPDATE maintenance_task SET status='completed',completed_at=?,retain_until=? WHERE id=?",completed,addTwelveMonthsUtc(completed),task)).rejects.toThrow();
    await expect(run("DELETE FROM export_delivery WHERE id='delivery'")).rejects.toThrow();
    await run(`UPDATE privacy_request SET status='completed',outcome='Synthetic artifact deletion confirmed',closed_at=${now} WHERE id='export-request'`);
    const closed=await db.prepare("SELECT closed_at FROM privacy_request WHERE id='export-request'").first<{closed_at:string}>();
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='export_delivery' AND target_id='delivery'").first()).toEqual({purge_due_at:addTwelveMonthsUtc(closed!.closed_at)});
    await expect(scheduled('export_delivery','delivery')).rejects.toThrow();
    await healthy();
  });
  it('detaches a due rejected origin while preserving bytes reused by a retained approved revision', async () => {
    await seedOld(true);
    const decisionTime=new Date(Date.now()-1000).toISOString(),expires=addTwelveMonthsUtc(decisionTime);
    await run("UPDATE log_revision SET decision='reject',reason='Synthetic rejected origin',decided_by='m',decided_at='2025-10-01T00:00:00.000Z' WHERE id='r'");
    await run("INSERT INTO log_revision(id,log_id,rev_no,kind,rating,outcome,facts,period_start,period_end,submitted_by,decision,reason,decided_by,decided_at) VALUES('retained','l',2,'filer_update',5,'positive','Synthetic retained approved later revision.','2026-01-01','2026-01-02','f','approve','Synthetic real stored review','m',?)",decisionTime);
    await run("UPDATE engagement_log SET status='published',current_revision_id='retained',published_at=?,expires_at=? WHERE id='l'",decisionTime,expires);
    await applyD1Migrations(db,env.TEST_MIGRATIONS.filter(m=>m.name<'0011'));
    await run("INSERT INTO revision_proof(revision_id,proof_id) VALUES('retained','p')");
    await applyD1Migrations(db,env.TEST_MIGRATIONS);
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='proof_file' AND target_id='p'").first()).toEqual({purge_due_at:expires});
    await expect(scheduled('proof_file','p')).rejects.toThrow();
    await expect(run("UPDATE proof_file SET revision_id='retained' WHERE id='p'")).rejects.toThrow(/origin/);
    await scheduled('log_revision','r');
    await run("DELETE FROM revision_proof WHERE revision_id='r'");
    await run("UPDATE proof_file SET revision_id=NULL WHERE id='p'");
    await run("DELETE FROM log_tag WHERE revision_id='r'");
    await run("DELETE FROM log_revision WHERE id='r'");
    expect(await db.prepare("SELECT revision_id,status FROM proof_file WHERE id='p'").first()).toEqual({revision_id:null,status:'attached'});
    expect((await db.prepare('SELECT * FROM revision_proof').all()).results).toEqual([{revision_id:'retained',proof_id:'p'}]);
    expect(await db.prepare("SELECT current_revision_id FROM engagement_log WHERE id='l'").first()).toEqual({current_revision_id:'retained'});
    await healthy();
  });
  it('keeps pending review live and starts rejected proof retention at rejection, not upload', async () => {
    await migrated();
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='proof_file' AND target_id='p'").first()).toEqual({purge_due_at:null});
    expect(await db.prepare("SELECT close_due_at FROM pilot_maintenance_target WHERE target_type='moderation_case' AND target_id='lc'").first()).toEqual({close_due_at:null});
    await expect(scheduled('proof_file','p')).rejects.toThrow();
    await initialDecision('reject');
    const deadline = await db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ',decided_at,'+30 days') AS purge_due_at FROM log_revision WHERE id='r'").first();
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='proof_file' AND target_id='p'").first()).toEqual(deadline);
    await expect(scheduled('proof_file','p')).rejects.toThrow();
    await healthy();
  });

  it('exposes abandoned ask-changes content deadlines while keeping minimal history on its own close clock', async () => {
    await seedOld(true,'2025-09-30T00:00:00.000Z');
    await run("UPDATE log_revision SET decision='ask_changes',reason='Synthetic old request',decided_by='m',decided_at='2025-10-01T00:00:00.000Z',submitted_at='2025-09-30T00:00:00.000Z' WHERE id='r'");
    await run("UPDATE engagement_log SET status='ask_changes',submitted_at='2025-09-30T00:00:00.000Z',first_submitted_at='2025-09-30T00:00:00.000Z' WHERE id='l'");
    await applyD1Migrations(db,env.TEST_MIGRATIONS.filter(m=>m.name<'0011'));
    await run("UPDATE moderation_case SET status='claimed',claimed_by='m',claimed_until='2025-10-01T00:30:00.000Z' WHERE id='lc'");
    await run("UPDATE moderation_case SET status='awaiting_changes',claimed_by=NULL,claimed_until=NULL WHERE id='lc'");
    await applyD1Migrations(db,env.TEST_MIGRATIONS);
    const before = await db.prepare("SELECT close_due_at FROM pilot_maintenance_target WHERE target_type='moderation_case' AND target_id='lc'").first<{close_due_at:string}>();
    expect(before!.close_due_at).not.toBeNull();
    expect(Date.parse(before!.close_due_at)).toBeLessThan(Date.now());
    const task=crypto.randomUUID();
    await run(`INSERT INTO maintenance_task(id,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES(?,'moderation_case','lc','close_abandoned','retention_due',?,${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`,task,before!.close_due_at);
    await run(`UPDATE maintenance_task SET status='claimed',claimed_at=${now},attempts=attempts+1 WHERE id=?`,task);
    await run(`UPDATE moderation_case SET status='closed',closed_at=${now},closure_kind='abandoned' WHERE id='lc'`);
    const closed=await db.prepare("SELECT closed_at FROM moderation_case WHERE id='lc'").first<{closed_at:string}>();
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='log_revision' AND target_id='r'").first()).toEqual({purge_due_at:closed!.closed_at});
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='proof_file' AND target_id='p'").first()).toEqual({purge_due_at:closed!.closed_at});
    expect(await db.prepare("SELECT purge_due_at FROM pilot_maintenance_target WHERE target_type='moderation_case' AND target_id='lc'").first()).toEqual({purge_due_at:addTwelveMonthsUtc(closed!.closed_at)});
    await healthy();
  });

  it('allows finite deferred actions against frozen scope and validates same-subject follow-ups', async () => {
    await migrated();
    const {request,task}=await assessed('policy_acceptance','ack','retire_policy');
    await run(`UPDATE privacy_request SET status='deferred',closed_at=${now},outcome='Finite assessed action remains pending' WHERE id=?`,request);
    const receipt=await db.prepare('SELECT closed_at,scope,assessment FROM privacy_request WHERE id=?').bind(request).first();
    expect(await db.prepare('SELECT id FROM pilot_maintenance_eligible WHERE id=?').bind(task).first()).toEqual({id:task});
    await expect(run("UPDATE privacy_request SET assessment='{}' WHERE id=?",request)).rejects.toThrow();
    await run(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope) VALUES('followup','f','a','deletion',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),?)`,JSON.stringify({priorRequestId:request,targets:[]}));
    await expect(run(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope) VALUES('wrong-subject','c','a','deletion',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),?)`,JSON.stringify({priorRequestId:request,targets:[]}))).rejects.toThrow(/same-subject/);
    await run(`UPDATE policy_acceptance SET retired_at=${now} WHERE id='ack'`);
    const time=(await db.prepare(`SELECT ${now} AS value`).first<{value:string}>())!.value;
    await run("UPDATE maintenance_task SET status='completed',completed_at=?,retain_until=? WHERE id=?",time,addTwelveMonthsUtc(time),task);
    expect(await db.prepare('SELECT closed_at,scope,assessment FROM privacy_request WHERE id=?').bind(request).first()).toEqual(receipt);
    await healthy();
  });

  it('abandons only expired unclaimed grants and requires an observed matching successor before completion', async () => {
    await seedOld();
    await applyD1Migrations(db,env.TEST_MIGRATIONS.filter(m=>m.name<'0011'));
    const target={targetType:'policy_acceptance',targetId:'ack',operation:'retire_policy',dueAt:'2025-10-01T00:00:00.000Z'};
    await run("INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope,status,identity_verified_at,assessed_at,assessment) VALUES('request','f','a','deletion','2025-10-01T00:00:00.000Z','2025-10-02T00:00:00.000Z',?,'executing','2025-10-01T00:00:00.000Z','2025-10-01T00:00:00.000Z',?)",JSON.stringify({targets:[target]}),JSON.stringify({targets:[{...target,basis:'assessed_erasure'}]}));
    await run("INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('expired','request','a','policy_acceptance','ack','retire_policy','assessed_erasure',?,'2025-10-01T00:00:00.000Z','2025-10-01T01:00:00.000Z')",target.dueAt);
    await applyD1Migrations(db,env.TEST_MIGRATIONS);
    await expect(run(`UPDATE maintenance_task SET status='claimed',claimed_at=${now},attempts=1 WHERE id='expired'`)).rejects.toThrow();
    const time=(await db.prepare(`SELECT ${now} AS value`).first<{value:string}>())!.value;
    await run("UPDATE maintenance_task SET status='abandoned',completed_at=?,retain_until=? WHERE id='expired'",time,addTwelveMonthsUtc(time));
    await expect(run(`UPDATE privacy_request SET status='completed',outcome='Forged success',closed_at=${now} WHERE id='request'`)).rejects.toThrow(/outstanding|required assessed/);
    await run(`INSERT INTO maintenance_task(id,privacy_request_id,authorized_by,target_type,target_id,operation,basis,due_at,authorized_at,authorization_expires_at) VALUES('successor','request','a','policy_acceptance','ack','retire_policy','assessed_erasure',?,${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 hour'))`,target.dueAt);
    await run(`UPDATE maintenance_task SET status='claimed',claimed_at=${now},attempts=1 WHERE id='successor'`);
    await expect(run("UPDATE maintenance_task SET status='abandoned',completed_at=?,retain_until=? WHERE id='successor'",time,addTwelveMonthsUtc(time))).rejects.toThrow();
    await expect(run("UPDATE maintenance_task SET status='completed',completed_at=?,retain_until=? WHERE id='successor'",time,addTwelveMonthsUtc(time))).rejects.toThrow(/purpose end/);
    await run(`UPDATE policy_acceptance SET retired_at=${now} WHERE id='ack'`);
    await run("UPDATE maintenance_task SET status='completed',completed_at=?,retain_until=? WHERE id='successor'",time,addTwelveMonthsUtc(time));
    await run(`UPDATE privacy_request SET status='completed',outcome='Matching action physically observed',closed_at=${now} WHERE id='request'`);
    await expect(run("UPDATE maintenance_task SET status='claimed' WHERE id='expired'")).rejects.toThrow();
    await healthy();
  });

  it('does not call an assessment completed when its required action was never issued', async () => {
    await migrated();
    const target={targetType:'policy_acceptance',targetId:'ack',operation:'retire_policy',dueAt:new Date(Date.now()-1000).toISOString()};
    await run(`INSERT INTO privacy_request(id,subject_user_id,responsible_id,kind,received_at,due_at,scope) VALUES('missing-work','f','a','deletion',${now},strftime('%Y-%m-%dT%H:%M:%fZ','now','+1 day'),?)`,JSON.stringify({targets:[target]}));
    await run(`UPDATE privacy_request SET status='executing',identity_verified_at=${now},assessed_at=${now},assessment=? WHERE id='missing-work'`,JSON.stringify({targets:[{...target,basis:'assessed_erasure'}]}));
    await expect(run(`UPDATE privacy_request SET status='completed',outcome='Missing work',closed_at=${now} WHERE id='missing-work'`)).rejects.toThrow(/required assessed/);
    expect(await db.prepare("SELECT status,closed_at FROM privacy_request WHERE id='missing-work'").first()).toEqual({status:'executing',closed_at:null});
  });
});
