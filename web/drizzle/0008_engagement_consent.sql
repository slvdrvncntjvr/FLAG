-- PRD-F9; SDD 3.6. Additive: no legacy row rewrite or inferred consent.
CREATE TABLE engagement_consent (
  engagement_id text PRIMARY KEY NOT NULL REFERENCES engagement(id) ON DELETE RESTRICT,
  policy_acceptance_id text NOT NULL UNIQUE REFERENCES policy_acceptance(id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX engagement_freelancer_created_idx ON engagement(freelancer_id,created_at);
--> statement-breakpoint
CREATE TRIGGER engagement_initial_state BEFORE INSERT ON engagement
WHEN NEW.status != 'invited' OR NEW.client_id IS NOT NULL OR NEW.accepted_at IS NOT NULL OR NEW.declined_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'New engagement must begin invited without client association'); END;
--> statement-breakpoint
CREATE TRIGGER engagement_consent_validate BEFORE INSERT ON engagement_consent
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM engagement e
    JOIN policy_acceptance pa ON pa.id=NEW.policy_acceptance_id
    JOIN user u ON u.id=pa.user_id
    JOIN client_profile cp ON cp.user_id=u.id
    WHERE e.id=NEW.engagement_id AND e.status='invited'
      AND e.client_id IS NULL AND e.accepted_at IS NULL AND e.declined_at IS NULL
      AND e.invite_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND u.role='client' AND u.banned=0 AND u.id != e.freelancer_id
      AND pa.policy='client_consent' AND pa.version='2026-10-12'
      AND pa.accepted_at >= e.created_at AND pa.accepted_at < e.invite_expires_at
  ) THEN RAISE(ABORT,'Invalid engagement consent') END;
END;
--> statement-breakpoint
CREATE TRIGGER engagement_consent_accept AFTER INSERT ON engagement_consent
BEGIN
  UPDATE engagement SET status='accepted',
    client_id=(SELECT cp.id FROM client_profile cp JOIN policy_acceptance pa ON pa.user_id=cp.user_id WHERE pa.id=NEW.policy_acceptance_id),
    accepted_at=(SELECT accepted_at FROM policy_acceptance WHERE id=NEW.policy_acceptance_id)
  WHERE id=NEW.engagement_id AND status='invited';
END;
--> statement-breakpoint
CREATE TRIGGER engagement_consent_frozen_update BEFORE UPDATE ON engagement_consent
BEGIN SELECT RAISE(ABORT,'Engagement consent is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER engagement_consent_frozen_delete BEFORE DELETE ON engagement_consent
BEGIN SELECT RAISE(ABORT,'Engagement consent is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER client_profile_consent_identity BEFORE UPDATE OF user_id ON client_profile
WHEN NEW.user_id IS NOT OLD.user_id AND EXISTS (
  SELECT 1 FROM engagement e JOIN engagement_consent ec ON ec.engagement_id=e.id WHERE e.client_id=OLD.id
)
BEGIN SELECT RAISE(ABORT,'Consenting client identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER engagement_lifecycle BEFORE UPDATE ON engagement
BEGIN
  SELECT CASE WHEN NEW.freelancer_id IS NOT OLD.freelancer_id
    OR NEW.invite_token_hash IS NOT OLD.invite_token_hash OR NEW.invite_expires_at IS NOT OLD.invite_expires_at
    OR NEW.created_at IS NOT OLD.created_at OR NEW.title IS NOT OLD.title
    OR NEW.client_name_hint IS NOT OLD.client_name_hint OR NEW.started_on IS NOT OLD.started_on
    THEN RAISE(ABORT,'Invitation facts are immutable') END;
  SELECT CASE WHEN OLD.status != 'invited' AND (NEW.status IS NOT OLD.status
    OR NEW.client_id IS NOT OLD.client_id OR NEW.accepted_at IS NOT OLD.accepted_at
    OR NEW.declined_at IS NOT OLD.declined_at)
    THEN RAISE(ABORT,'Invitation is closed') END;
  SELECT CASE WHEN OLD.status='invited' AND NEW.status='accepted' AND NOT EXISTS (
    SELECT 1 FROM engagement_consent ec JOIN policy_acceptance pa ON pa.id=ec.policy_acceptance_id
    JOIN client_profile cp ON cp.user_id=pa.user_id
    WHERE ec.engagement_id=OLD.id AND cp.id=NEW.client_id
      AND pa.policy='client_consent' AND pa.accepted_at=NEW.accepted_at
      AND cp.user_id != NEW.freelancer_id AND NEW.declined_at IS NULL
      AND OLD.invite_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
  ) THEN RAISE(ABORT,'Acceptance requires engagement consent') END;
  SELECT CASE WHEN OLD.status='invited' AND NEW.status != 'accepted' AND (
    NEW.client_id IS NOT NULL OR NEW.accepted_at IS NOT NULL
    OR (NEW.status='declined' AND NEW.declined_at IS NULL)
    OR (NEW.status!='declined' AND NEW.declined_at IS NOT NULL)
  ) THEN RAISE(ABORT,'Invalid invitation state') END;
END;
