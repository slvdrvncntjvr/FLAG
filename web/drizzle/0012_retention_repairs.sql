-- Durable verification owner; existing published SQL/snapshots stay unchanged.
ALTER TABLE moderation_case ADD COLUMN verification_subject_user_id text REFERENCES user(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE INDEX moderation_case_verification_subject_idx ON moderation_case(verification_subject_user_id);
--> statement-breakpoint
DROP TRIGGER pilot_case_update;
--> statement-breakpoint
DROP TRIGGER moderation_verification_close;
--> statement-breakpoint
-- No evidence, status, close clock or inspection field is changed.
UPDATE moderation_case SET verification_subject_user_id=(SELECT v.freelancer_id FROM verification_case v WHERE v.id=moderation_case.subject_id)
WHERE kind='verification' AND EXISTS(SELECT 1 FROM verification_case v WHERE v.id=moderation_case.subject_id);
--> statement-breakpoint
CREATE TRIGGER pilot_case_update BEFORE UPDATE ON moderation_case BEGIN
 SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.subject_id IS NOT OLD.subject_id OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT,'case identity is immutable') END;
 SELECT CASE WHEN (OLD.status IN ('decided','closed') OR NEW.log_id IS NOT OLD.log_id OR NEW.correction_request_id IS NOT OLD.correction_request_id) AND NOT ((NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.subject_id IS OLD.subject_id AND NEW.status IS OLD.status AND NEW.claimed_by IS OLD.claimed_by AND NEW.claimed_until IS OLD.claimed_until AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_by IS OLD.decided_by AND NEW.decided_at IS OLD.decided_at AND NEW.created_at IS OLD.created_at AND NEW.closed_at IS OLD.closed_at AND NEW.closure_kind IS OLD.closure_kind AND OLD.status IN ('decided','closed') AND ((NEW.log_id IS NULL AND OLD.log_id IS NOT NULL AND NEW.correction_request_id IS OLD.correction_request_id AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge')) OR (NEW.log_id IS OLD.log_id AND NEW.correction_request_id IS NULL AND OLD.correction_request_id IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='correction_request' AND m.target_id=OLD.correction_request_id AND m.operation='purge')))) OR (OLD.kind='verification' AND OLD.status='decided' AND OLD.closed_at IS NULL AND NEW.closed_at IS OLD.decided_at AND NEW.closure_kind='decision' AND NEW.id IS OLD.id AND NEW.kind IS OLD.kind AND NEW.subject_id IS OLD.subject_id AND NEW.status IS OLD.status AND NEW.claimed_by IS OLD.claimed_by AND NEW.claimed_until IS OLD.claimed_until AND NEW.decision IS OLD.decision AND NEW.reason IS OLD.reason AND NEW.decided_by IS OLD.decided_by AND NEW.decided_at IS OLD.decided_at AND NEW.created_at IS OLD.created_at AND NEW.log_id IS OLD.log_id AND NEW.correction_request_id IS OLD.correction_request_id)) THEN RAISE(ABORT,'terminal case is immutable') END;
 SELECT CASE WHEN OLD.status NOT IN ('decided','closed') AND NOT ((NEW.status='closed' AND NEW.closure_kind='erased' AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='engagement_log' AND m.target_id=OLD.log_id AND m.operation='purge') AND abs((julianday(NEW.closed_at)-julianday('now'))*86400)<=60) OR (NEW.status='claimed' AND OLD.status IN ('open','claimed') AND EXISTS(SELECT 1 FROM pilot_case_reviewer a WHERE a.case_id=OLD.id AND a.reviewer_id=NEW.claimed_by) AND NEW.claimed_until>strftime('%Y-%m-%dT%H:%M:%fZ','now') AND julianday(NEW.claimed_until)<=julianday('now')+30.0/1440+1.0/86400 AND (OLD.status!='claimed' OR OLD.claimed_until<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NEW.claimed_by=OLD.claimed_by)) OR (OLD.status='claimed' AND NEW.status='open' AND EXISTS(SELECT 1 FROM pilot_case_reviewer a WHERE a.case_id=OLD.id AND a.reviewer_id=OLD.claimed_by)) OR (OLD.status='awaiting_changes' AND NEW.status='open' AND ((OLD.kind IN ('log','filer_update') AND EXISTS(SELECT 1 FROM log_revision r JOIN pilot_filer_actor f ON f.log_id=r.log_id AND f.filer_id=r.submitted_by WHERE r.moderation_case_id=OLD.id AND r.state='draft' AND r.decision IS NULL)) OR (OLD.kind='correction' AND EXISTS(SELECT 1 FROM correction_request q WHERE q.id=OLD.correction_request_id AND q.status='ask_changes')))) OR (OLD.status='claimed' AND NEW.status IN ('decided','awaiting_changes') AND ((OLD.kind='verification' AND NEW.status='decided' AND NEW.decided_by=OLD.claimed_by AND EXISTS(SELECT 1 FROM pilot_live_staff a WHERE a.id=OLD.claimed_by AND a.role='moderator')) OR EXISTS(SELECT 1 FROM pilot_complete_round rr WHERE rr.case_id=OLD.id AND rr.reviewer_id=OLD.claimed_by AND ((NEW.status='awaiting_changes' AND rr.decision='ask_changes') OR (NEW.status='decided' AND rr.decision=NEW.decision AND rr.reason=NEW.reason AND rr.decided_at=NEW.decided_at AND rr.reviewer_id=NEW.decided_by))))) OR (NEW.status='closed' AND NEW.closure_kind='abandoned' AND abs((julianday(NEW.closed_at)-julianday('now'))*86400)<=60 AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.attempts>0 AND m.claimed_at IS NOT NULL AND m.target_type='moderation_case' AND m.target_id=OLD.id AND m.operation='close_abandoned'))) THEN RAISE(ABORT,'case transition requires current exact authority') END;
END;
--> statement-breakpoint
CREATE TRIGGER moderation_verification_close AFTER UPDATE ON moderation_case WHEN NEW.kind='verification' AND NEW.status='decided' AND NEW.closed_at IS NULL BEGIN UPDATE moderation_case SET closed_at=NEW.decided_at,closure_kind='decision' WHERE id=NEW.id; END;
--> statement-breakpoint
DROP TRIGGER pilot_case_insert;
--> statement-breakpoint
CREATE TRIGGER pilot_case_insert BEFORE INSERT ON moderation_case BEGIN
 SELECT CASE WHEN NEW.status!='open' OR NEW.claimed_by IS NOT NULL OR NEW.claimed_until IS NOT NULL OR NEW.decision IS NOT NULL OR NEW.closed_at IS NOT NULL OR NEW.closure_kind IS NOT NULL THEN RAISE(ABORT,'case must start open') END;
 SELECT CASE WHEN NOT ((NEW.kind='verification' AND NEW.log_id IS NULL AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM verification_case v WHERE v.id=NEW.subject_id AND v.decided_at IS NULL)) OR (NEW.kind='log' AND NEW.subject_id=NEW.log_id AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND l.status IN ('draft','ask_changes'))) OR (NEW.kind='filer_update' AND NEW.correction_request_id IS NULL AND EXISTS(SELECT 1 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=NEW.subject_id AND r.log_id=NEW.log_id AND r.kind='filer_update' AND r.state='draft' AND r.decision IS NULL AND l.status IN ('published','hidden') AND l.expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now'))) OR (NEW.kind='correction' AND NEW.subject_id=NEW.correction_request_id AND EXISTS(SELECT 1 FROM correction_request q WHERE q.id=NEW.subject_id AND q.log_id=NEW.log_id AND q.status IN ('draft','ask_changes')))) THEN RAISE(ABORT,'typed case subject mismatch') END;
 SELECT CASE WHEN (NEW.kind='verification' AND NOT EXISTS(SELECT 1 FROM verification_case v WHERE v.id=NEW.subject_id AND v.freelancer_id=NEW.verification_subject_user_id))
 OR (NEW.kind!='verification' AND NEW.verification_subject_user_id IS NOT NULL)
 THEN RAISE(ABORT,'exact verification subject required') END;
END;
--> statement-breakpoint
CREATE TRIGGER verification_subject_frozen BEFORE UPDATE OF verification_subject_user_id ON moderation_case
WHEN NEW.verification_subject_user_id IS NOT OLD.verification_subject_user_id
BEGIN SELECT RAISE(ABORT,'verification subject is immutable'); END;
--> statement-breakpoint
DROP VIEW pilot_privacy_subject_target;
--> statement-breakpoint
CREATE VIEW pilot_privacy_subject_target AS
SELECT k.target_type,k.target_id,subject.value AS subject_user_id FROM (SELECT * FROM pilot_privacy_subject_key LIMIT -1) k,
json_each(CASE k.binding_type
 WHEN 'user' THEN json_array(k.binding_id)
 WHEN 'log' THEN json_array((SELECT freelancer_id FROM engagement_log WHERE id=k.binding_id),(SELECT cp.user_id FROM engagement_log l JOIN client_profile cp ON cp.id=l.client_id WHERE l.id=k.binding_id))
 WHEN 'engagement' THEN json_array((SELECT freelancer_id FROM engagement WHERE id=k.binding_id),(SELECT cp.user_id FROM engagement e JOIN client_profile cp ON cp.id=e.client_id WHERE e.id=k.binding_id))
 WHEN 'verification' THEN json_array((SELECT freelancer_id FROM verification_case WHERE id=k.binding_id))
 WHEN 'correction' THEN json_array((SELECT requested_by FROM correction_request WHERE id=k.binding_id),(SELECT l.freelancer_id FROM correction_request q JOIN engagement_log l ON l.id=q.log_id WHERE q.id=k.binding_id),(SELECT cp.user_id FROM correction_request q JOIN engagement_log l ON l.id=q.log_id JOIN client_profile cp ON cp.id=l.client_id WHERE q.id=k.binding_id))
 WHEN 'case' THEN json_array((SELECT l.freelancer_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id WHERE c.id=k.binding_id),(SELECT cp.user_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id JOIN client_profile cp ON cp.id=l.client_id WHERE c.id=k.binding_id),(SELECT c.verification_subject_user_id FROM moderation_case c WHERE c.kind='verification' AND c.id=k.binding_id),(SELECT q.requested_by FROM moderation_case c JOIN correction_request q ON q.id=c.correction_request_id WHERE c.id=k.binding_id))
 WHEN 'audit' THEN json_insert(json_array((SELECT l.freelancer_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id)),(SELECT cp.user_id FROM moderation_case c JOIN engagement_log l ON l.id=c.log_id JOIN client_profile cp ON cp.id=l.client_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id)),(SELECT c.verification_subject_user_id FROM moderation_case c WHERE c.kind='verification' AND c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id)),(SELECT q.requested_by FROM moderation_case c JOIN correction_request q ON q.id=c.correction_request_id WHERE c.id=(SELECT moderation_case_id FROM audit_event WHERE id=k.binding_id))),'$[#]',(SELECT actor_id FROM audit_event WHERE id=k.binding_id))
 ELSE '[]' END) subject WHERE subject.type='text';
--> statement-breakpoint
-- Forward-only retention repairs; published migrations 0000-0011 remain unchanged.
--> statement-breakpoint
DROP TRIGGER pilot_user_delete;
--> statement-breakpoint
CREATE TRIGGER pilot_user_delete BEFORE DELETE ON user BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='purge') THEN RAISE(ABORT,'exact claimed purge task required') END;
 SELECT CASE WHEN OLD.deactivated_at IS NULL OR EXISTS(SELECT 1 FROM session WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM account WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM policy_acceptance WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM freelancer_profile WHERE user_id=OLD.id) OR EXISTS(SELECT 1 FROM client_profile WHERE user_id=OLD.id) THEN RAISE(ABORT,'retained user dependencies') END;
 -- The live-task unique index permits one claimed user/purge grant. Keep its
 -- request attached while all other same-subject request guards run.
 UPDATE privacy_request SET subject_user_id=NULL WHERE subject_user_id=OLD.id
 AND id NOT IN (SELECT m.privacy_request_id FROM maintenance_task m WHERE m.status='claimed' AND m.target_type='user' AND m.target_id=OLD.id AND m.operation='purge' AND m.privacy_request_id IS NOT NULL);
 -- Detach the authorizing request last. Its BEFORE UPDATE guards still see
 -- its original subject; no destructive statement needs a detached authority.
 UPDATE privacy_request SET subject_user_id=NULL WHERE subject_user_id=OLD.id;
END;
--> statement-breakpoint
DROP TRIGGER audit_frozen;
--> statement-breakpoint
UPDATE audit_event SET moderation_case_id=(SELECT c.id FROM moderation_case c WHERE
 (audit_event.subject_type='verification_case' AND audit_event.action IN ('verification_requested','verification_inspected','verification_decided') AND c.kind='verification' AND c.subject_id=audit_event.subject_id)
 OR (audit_event.subject_type='moderation_case' AND audit_event.action IN ('moderation_claimed','moderation_reclaimed','moderation_released') AND c.kind='verification' AND c.id=audit_event.subject_id))
WHERE moderation_case_id IS NULL AND (SELECT count(*) FROM (SELECT c.id FROM moderation_case c WHERE
 (audit_event.subject_type='verification_case' AND audit_event.action IN ('verification_requested','verification_inspected','verification_decided') AND c.kind='verification' AND c.subject_id=audit_event.subject_id)
 OR (audit_event.subject_type='moderation_case' AND audit_event.action IN ('moderation_claimed','moderation_reclaimed','moderation_released') AND c.kind='verification' AND c.id=audit_event.subject_id)))=1;
--> statement-breakpoint
CREATE TRIGGER audit_frozen BEFORE UPDATE ON audit_event BEGIN
SELECT CASE WHEN (NOT ((NEW.id IS OLD.id AND NEW.action IS OLD.action AND NEW.subject_type IS OLD.subject_type AND NEW.subject_id IS OLD.subject_id AND NEW.created_at IS OLD.created_at AND NEW.moderation_case_id IS OLD.moderation_case_id AND NEW.retain_until IS OLD.retain_until AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL AND EXISTS(SELECT 1 FROM pilot_maintenance_eligible m WHERE m.status='claimed' AND m.claimed_at IS NOT NULL AND m.attempts>0 AND m.target_type='user' AND m.target_id=OLD.actor_id AND m.operation='redact_identity')) OR (NEW.id IS OLD.id AND NEW.actor_id IS OLD.actor_id AND NEW.action IS OLD.action AND NEW.subject_type IS OLD.subject_type AND NEW.subject_id IS OLD.subject_id AND NEW.created_at IS OLD.created_at AND NEW.moderation_case_id IS OLD.moderation_case_id AND OLD.retain_until IS NULL AND NEW.retain_until IS NOT NULL AND NEW.retain_until=(strftime('%Y-%m-',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year')||printf('%02d',min(CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now')) AS INTEGER),CAST(strftime('%d',strftime('%Y-%m-%dT%H:%M:%fZ','now'),'start of month','+1 year','+1 month','-1 day') AS INTEGER)))||substr(strftime('%Y-%m-%dT%H:%M:%fZ','now'),11))))) THEN RAISE(ABORT,'audit is immutable') END;
END;
--> statement-breakpoint

-- Keep the shared exact authority/hold/due-date view unchanged. Enforce this
-- dependency at issuance and claim without expanding its join into that view.
CREATE TRIGGER verification_close_anchor_issue BEFORE INSERT ON maintenance_task
WHEN NEW.target_type='moderation_case' AND NEW.operation='purge' AND EXISTS(
 SELECT 1 FROM moderation_case c JOIN verification_case v ON c.kind='verification' AND v.id=c.subject_id WHERE c.id=NEW.target_id)
BEGIN SELECT RAISE(ABORT,'verification subject still needs case close anchor'); END;
--> statement-breakpoint
CREATE TRIGGER verification_close_anchor_claim BEFORE UPDATE ON maintenance_task
WHEN NEW.status='claimed' AND NEW.target_type='moderation_case' AND NEW.operation='purge' AND EXISTS(
 SELECT 1 FROM moderation_case c JOIN verification_case v ON c.kind='verification' AND v.id=c.subject_id WHERE c.id=NEW.target_id)
BEGIN SELECT RAISE(ABORT,'verification subject still needs case close anchor'); END;
--> statement-breakpoint
CREATE TRIGGER verification_close_anchor_required BEFORE DELETE ON moderation_case
WHEN OLD.kind='verification' AND EXISTS(SELECT 1 FROM verification_case v WHERE v.id=OLD.subject_id)
BEGIN SELECT RAISE(ABORT,'verification subject still needs case close anchor'); END;
--> statement-breakpoint
DROP TRIGGER hold_issue;
--> statement-breakpoint
CREATE TRIGGER hold_issue BEFORE INSERT ON retention_hold BEGIN
SELECT CASE WHEN EXISTS(SELECT 1 FROM proof_file p WHERE p.purge_inflight=1
 AND ((NEW.target_type='proof' AND NEW.target_id=p.id) OR (NEW.target_type='log' AND NEW.target_id=p.log_id)))
 THEN RAISE(ABORT,'proof purge already claimed') END;
SELECT CASE WHEN (NOT ((NEW.target_type='user' AND EXISTS(SELECT 1 FROM user WHERE id=NEW.target_id)) OR (NEW.target_type='log' AND EXISTS(SELECT 1 FROM engagement_log WHERE id=NEW.target_id)) OR (NEW.target_type='revision' AND EXISTS(SELECT 1 FROM log_revision WHERE id=NEW.target_id)) OR (NEW.target_type='proof' AND EXISTS(SELECT 1 FROM proof_file WHERE id=NEW.target_id)) OR (NEW.target_type='case' AND (EXISTS(SELECT 1 FROM moderation_case WHERE id=NEW.target_id) OR EXISTS(SELECT 1 FROM verification_case WHERE id=NEW.target_id))) OR (NEW.target_type='policy' AND EXISTS(SELECT 1 FROM policy_acceptance WHERE id=NEW.target_id)) OR (NEW.target_type='request' AND EXISTS(SELECT 1 FROM privacy_request WHERE id=NEW.target_id)) OR (NEW.target_type='audit' AND EXISTS(SELECT 1 FROM audit_event WHERE id=NEW.target_id)))) THEN RAISE(ABORT,'hold target does not exist') END;SELECT CASE WHEN (NEW.released_at IS NOT NULL OR NEW.expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') OR NOT EXISTS(SELECT 1 FROM pilot_live_staff s WHERE s.id=NEW.responsible_id)) THEN RAISE(ABORT,'current bounded hold owner required') END;SELECT CASE WHEN (EXISTS(SELECT 1 FROM maintenance_task t JOIN pilot_maintenance_target x ON x.target_type=t.target_type AND x.target_id=t.target_id WHERE t.status='claimed' AND ((x.hold_type=NEW.target_type AND x.target_id=NEW.target_id) OR (NEW.target_type='log' AND x.log_id=NEW.target_id)))) THEN RAISE(ABORT,'purge already claimed') END;
END;
