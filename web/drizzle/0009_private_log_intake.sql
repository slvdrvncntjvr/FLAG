-- PRD-F2/F3 private initial intake only. Preserve legacy values and published migrations.
ALTER TABLE engagement_log ADD COLUMN draft_updated_at text;
--> statement-breakpoint
ALTER TABLE proof_file ADD COLUMN purge_attempts integer NOT NULL DEFAULT 0 CONSTRAINT proof_file_purge_attempts_check CHECK(typeof(purge_attempts)='integer' AND purge_attempts BETWEEN 0 AND 9007199254740991);
--> statement-breakpoint
ALTER TABLE proof_file ADD COLUMN purge_inflight integer NOT NULL DEFAULT 0 CONSTRAINT proof_file_purge_inflight_check CHECK(typeof(purge_inflight)='integer' AND purge_inflight IN (0,1));
--> statement-breakpoint
CREATE TRIGGER log_private_insert BEFORE INSERT ON engagement_log
BEGIN
  SELECT CASE WHEN NEW.status != 'draft' OR NEW.first_submitted_at IS NOT NULL OR NEW.submitted_at IS NOT NULL OR NEW.published_at IS NOT NULL OR NEW.expires_at IS NOT NULL OR NEW.current_revision_id IS NOT NULL THEN RAISE(ABORT,'private log must start as draft') END;
END;
--> statement-breakpoint
CREATE TRIGGER log_private_update BEFORE UPDATE ON engagement_log
BEGIN
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.ref IS NOT OLD.ref OR NEW.engagement_id IS NOT OLD.engagement_id OR NEW.freelancer_id IS NOT OLD.freelancer_id OR NEW.client_id IS NOT OLD.client_id OR NEW.anchor_kind IS NOT OLD.anchor_kind OR NEW.anchor_date IS NOT OLD.anchor_date OR NEW.created_at IS NOT OLD.created_at THEN RAISE(ABORT,'log identity and anchor are immutable') END;
  SELECT CASE WHEN NOT (NEW.status=OLD.status OR (OLD.status='draft' AND NEW.status='pending')) THEN RAISE(ABORT,'private log transition is not supported') END;
  SELECT CASE WHEN NEW.published_at IS NOT OLD.published_at OR NEW.expires_at IS NOT OLD.expires_at OR NEW.current_revision_id IS NOT OLD.current_revision_id THEN RAISE(ABORT,'publication is not supported by private intake') END;
  SELECT CASE WHEN OLD.status != 'draft' AND (NEW.first_submitted_at IS NOT OLD.first_submitted_at OR NEW.submitted_at IS NOT OLD.submitted_at OR NEW.draft_updated_at IS NOT OLD.draft_updated_at) THEN RAISE(ABORT,'submitted log is frozen') END;
  SELECT CASE WHEN NEW.status='draft' AND (NEW.first_submitted_at IS NOT NULL OR NEW.submitted_at IS NOT NULL) THEN RAISE(ABORT,'draft cannot fabricate submission') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM proof_file WHERE log_id=OLD.id AND status='pending_purge') AND (NEW.draft_updated_at IS NOT OLD.draft_updated_at OR NEW.hold_kind IS NOT OLD.hold_kind OR NEW.hold_placed_at IS NOT OLD.hold_placed_at OR NEW.hold_released_at IS NOT OLD.hold_released_at) THEN RAISE(ABORT,'draft cleanup is in progress') END;
END;
--> statement-breakpoint
CREATE TRIGGER log_requires_proof BEFORE UPDATE OF status ON engagement_log
WHEN OLD.status='draft' AND NEW.status='pending'
BEGIN
  SELECT CASE WHEN NEW.first_submitted_at IS NULL OR NEW.submitted_at IS NOT NEW.first_submitted_at OR julianday(NEW.first_submitted_at) IS NULL OR abs((julianday(NEW.first_submitted_at)-julianday('now'))*86400)>60 THEN RAISE(ABORT,'initial submission needs current server time') END;
  SELECT CASE WHEN date(NEW.first_submitted_at,'+8 hours') < NEW.anchor_date OR date(NEW.first_submitted_at,'+8 hours') > date(NEW.anchor_date,'+15 days') THEN RAISE(ABORT,'outside filing window') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM engagement e JOIN user u ON u.id=NEW.freelancer_id JOIN freelancer_profile f ON f.user_id=u.id WHERE e.id=NEW.engagement_id AND e.status='accepted' AND e.client_id=NEW.client_id AND e.freelancer_id=NEW.freelancer_id AND u.role='freelancer' AND u.banned=0 AND f.status='verified') THEN RAISE(ABORT,'accepted engagement and verified freelancer required') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM log_revision r WHERE r.log_id=NEW.id AND r.rev_no=1 AND r.kind='initial' AND r.submitted_by=NEW.freelancer_id AND r.decision IS NULL AND r.decided_at IS NULL AND r.decided_by IS NULL AND length(trim(r.facts)) BETWEEN 40 AND 2000 AND EXISTS(SELECT 1 FROM log_tag t WHERE t.revision_id=r.id)) THEN RAISE(ABORT,'complete initial revision required') END;
  SELECT CASE WHEN (SELECT count(*) FROM proof_file p JOIN log_revision r ON r.id=p.revision_id AND r.log_id=p.log_id WHERE p.log_id=NEW.id AND p.status='attached' AND p.owner_kind='filer' AND p.uploaded_by=NEW.freelancer_id AND r.rev_no=1 AND r.kind='initial') NOT BETWEEN 1 AND 5 OR EXISTS(SELECT 1 FROM proof_file WHERE log_id=NEW.id AND status IN ('uploading','pending_purge')) THEN RAISE(ABORT,'attached proof required and uploads must be complete') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM moderation_case WHERE kind='log' AND subject_id=NEW.id AND status='open') THEN RAISE(ABORT,'open log moderation case required') END;
  SELECT CASE WHEN (SELECT count(*) FROM engagement_log WHERE freelancer_id=NEW.freelancer_id AND id!=NEW.id AND first_submitted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days'))>=10 OR (SELECT count(*) FROM engagement_log WHERE freelancer_id=NEW.freelancer_id AND client_id=NEW.client_id AND id!=NEW.id AND first_submitted_at>strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 months'))>=3 THEN RAISE(ABORT,'log submission quota reached') END;
  SELECT CASE WHEN NEW.hold_kind IS NOT NULL AND (NEW.hold_released_at IS NULL OR NEW.hold_released_at < NEW.hold_placed_at) THEN RAISE(ABORT,'held draft cannot submit') END;
END;
--> statement-breakpoint
CREATE TRIGGER log_private_delete BEFORE DELETE ON engagement_log
WHEN OLD.status!='draft' OR (OLD.hold_kind IS NOT NULL AND (OLD.hold_released_at IS NULL OR OLD.hold_released_at<OLD.hold_placed_at))
BEGIN
  SELECT RAISE(ABORT,'submitted or held log cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER log_revision_private_insert BEFORE INSERT ON log_revision
WHEN EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND (l.status!='draft' OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge')))
BEGIN
  SELECT RAISE(ABORT,'log revision is frozen');
END;
--> statement-breakpoint
CREATE TRIGGER log_tag_private_insert BEFORE INSERT ON log_tag
WHEN EXISTS(SELECT 1 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=NEW.revision_id AND (l.status!='draft' OR r.decision IS NOT NULL OR r.decided_at IS NOT NULL OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge')))
BEGIN
  SELECT RAISE(ABORT,'log tags are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER log_revision_private_update BEFORE UPDATE ON log_revision
WHEN EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND (l.status!='draft' OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge'))) OR NEW.log_id IS NOT OLD.log_id OR NEW.id IS NOT OLD.id OR NEW.rev_no IS NOT OLD.rev_no OR NEW.kind IS NOT OLD.kind OR NEW.submitted_by IS NOT OLD.submitted_by OR OLD.decision IS NOT NULL OR OLD.decided_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'log revision is frozen');
END;
--> statement-breakpoint
CREATE TRIGGER log_tag_private_update BEFORE UPDATE ON log_tag
WHEN EXISTS(SELECT 1 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=NEW.revision_id AND (l.status!='draft' OR r.decision IS NOT NULL OR r.decided_at IS NOT NULL OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge'))) OR NEW.revision_id IS NOT OLD.revision_id
BEGIN
  SELECT RAISE(ABORT,'log tags are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER log_revision_private_delete BEFORE DELETE ON log_revision
WHEN EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND (l.status!='draft' OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge'))) OR OLD.decision IS NOT NULL OR OLD.decided_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'log revision is frozen');
END;
--> statement-breakpoint
CREATE TRIGGER log_tag_private_delete BEFORE DELETE ON log_tag
WHEN EXISTS(SELECT 1 FROM log_revision r JOIN engagement_log l ON l.id=r.log_id WHERE r.id=OLD.revision_id AND (l.status!='draft' OR r.decision IS NOT NULL OR r.decided_at IS NOT NULL OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge')))
BEGIN
  SELECT RAISE(ABORT,'log tags are frozen');
END;
--> statement-breakpoint
CREATE TRIGGER proof_private_insert BEFORE INSERT ON proof_file
BEGIN
  SELECT CASE WHEN NEW.purge_attempts!=0 OR NEW.purge_inflight!=0 THEN RAISE(ABORT,'proof retry count must start at zero') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND l.status='draft') THEN RAISE(ABORT,'proof requires editable draft') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=NEW.log_id AND ((l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)) OR EXISTS(SELECT 1 FROM proof_file p WHERE p.log_id=l.id AND p.status='pending_purge'))) THEN RAISE(ABORT,'proof draft held or cleanup in progress') END;
  SELECT CASE WHEN (SELECT count(*) FROM proof_file WHERE log_id=NEW.log_id AND status IN ('uploading','attached'))>=5 THEN RAISE(ABORT,'five proof limit reached') END;
  SELECT CASE WHEN NEW.status NOT IN ('uploading','pending_purge') OR (NEW.status='uploading' AND NEW.revision_id IS NOT NULL) THEN RAISE(ABORT,'proof must begin unbound uploading') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_private_update BEFORE UPDATE ON proof_file
BEGIN
  SELECT CASE WHEN NEW.purge_attempts IS NOT OLD.purge_attempts AND NOT (OLD.status='pending_purge' AND NEW.status='pending_purge' AND OLD.purge_inflight=0 AND NEW.purge_inflight=1 AND NEW.purge_attempts=OLD.purge_attempts+1) THEN RAISE(ABORT,'proof retry count is maintenance only') END;
  SELECT CASE WHEN NEW.purge_inflight IS NOT OLD.purge_inflight AND NOT ((OLD.status='pending_purge' AND NEW.status='pending_purge' AND OLD.purge_inflight=0 AND NEW.purge_inflight=1 AND NEW.purge_attempts=OLD.purge_attempts+1) OR (OLD.status='pending_purge' AND NEW.status IN ('pending_purge','purged') AND OLD.purge_inflight=1 AND NEW.purge_inflight=0 AND NEW.purge_attempts=OLD.purge_attempts)) THEN RAISE(ABORT,'invalid purge ownership transition') END;
  SELECT CASE WHEN NEW.purge_inflight=1 AND NEW.status!='pending_purge' THEN RAISE(ABORT,'active purge must retain claim') END;
  SELECT CASE WHEN NEW.id IS NOT OLD.id OR NEW.log_id IS NOT OLD.log_id OR NEW.owner_kind IS NOT OLD.owner_kind OR NEW.uploaded_by IS NOT OLD.uploaded_by OR NEW.object_key IS NOT OLD.object_key OR NEW.kind IS NOT OLD.kind OR NEW.mime IS NOT OLD.mime OR NEW.size_bytes IS NOT OLD.size_bytes OR NEW.sha256 IS NOT OLD.sha256 OR NEW.uploaded_at IS NOT OLD.uploaded_at THEN RAISE(ABORT,'proof byte metadata is immutable') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND (l.status!='draft' OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at)))) THEN RAISE(ABORT,'submitted or held proof is frozen') END;
  SELECT CASE WHEN NOT (NEW.status=OLD.status OR (OLD.status='uploading' AND NEW.status IN ('attached','abandoned','pending_purge')) OR (OLD.status IN ('abandoned','purged') AND NEW.status='pending_purge') OR (OLD.status='pending_purge' AND NEW.status='purged')) THEN RAISE(ABORT,'invalid proof transition') END;
  SELECT CASE WHEN NEW.revision_id IS NOT OLD.revision_id AND NOT (OLD.status='uploading' AND NEW.status='attached' AND OLD.revision_id IS NULL AND NEW.revision_id IS NOT NULL) THEN RAISE(ABORT,'proof revision binding is immutable') END;
  SELECT CASE WHEN NEW.status='attached' AND (NEW.revision_id IS NULL OR NEW.owner_kind!='filer' OR NOT EXISTS(SELECT 1 FROM engagement_log l JOIN log_revision r ON r.log_id=l.id WHERE l.id=NEW.log_id AND l.freelancer_id=NEW.uploaded_by AND r.id=NEW.revision_id AND r.rev_no=1 AND r.kind='initial')) THEN RAISE(ABORT,'attached proof must belong to initial filer revision') END;
END;
--> statement-breakpoint
CREATE TRIGGER proof_private_delete BEFORE DELETE ON proof_file
WHEN OLD.status!='purged' OR EXISTS(SELECT 1 FROM engagement_log l WHERE l.id=OLD.log_id AND (l.status!='draft' OR (l.hold_kind IS NOT NULL AND (l.hold_released_at IS NULL OR l.hold_released_at < l.hold_placed_at))))
BEGIN
  SELECT RAISE(ABORT,'proof bytes must be purged before metadata deletion');
END;
--> statement-breakpoint
CREATE TRIGGER log_reference_sequence_insert BEFORE INSERT ON auth_rate_limit
WHEN NEW.key='log-reference-sequence' AND (NEW.expires_at!=9007199254740991 OR NEW.count<1042)
BEGIN
  SELECT RAISE(ABORT,'invalid permanent log reference sequence');
END;
--> statement-breakpoint
CREATE TRIGGER log_reference_sequence_update BEFORE UPDATE ON auth_rate_limit
WHEN (OLD.key='log-reference-sequence' OR NEW.key='log-reference-sequence') AND (NEW.key IS NOT OLD.key OR NEW.count<OLD.count OR NEW.expires_at!=9007199254740991)
BEGIN
  SELECT RAISE(ABORT,'log reference highwater cannot decrease');
END;
--> statement-breakpoint
CREATE TRIGGER log_reference_sequence_delete BEFORE DELETE ON auth_rate_limit
WHEN OLD.key='log-reference-sequence'
BEGIN
  SELECT RAISE(ABORT,'log reference sequence is permanent');
END;
