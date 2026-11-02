// Schema contract: docs/sdd-flag.md §3.1. Add an entity here only after the ERD has it.
// Timestamps are ISO-8601 text and booleans are 0/1 integers (SDD §3).
import { sql } from "drizzle-orm";
import { type AnySQLiteColumn, check, customType, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const isoNow = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

// Better Auth passes Date objects; D1 cannot bind them. Store ISO-8601 text so values sort lexically.
const isoTime = customType<{ data: string; driverData: string }>({
  dataType: () => "text",
  toDriver: (value: string | Date) => (value instanceof Date ? value.toISOString() : value),
});

export const ROLES = ["freelancer", "client", "moderator", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const user = sqliteTable(
  "user",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    // Null until onboarding (LOG 2026-10-12); never set from a sign-up payload (AB-12).
    role: text("role", { enum: ROLES }),
    banned: integer("banned", { mode: "boolean" }).notNull().default(false),
    banReason: text("ban_reason"),
    phoneNumber: text("phone_number").unique(),
    phoneNumberVerified: integer("phone_number_verified", { mode: "boolean" }).notNull().default(false),
    createdAt: isoTime("created_at").notNull().default(isoNow),
    updatedAt: isoTime("updated_at").notNull().default(isoNow),
    deactivatedAt: isoTime("deactivated_at"),
  },
  (t) => [check("user_role_check", sql`${t.role} IS NULL OR ${t.role} IN ('freelancer','client','moderator','admin')`)],
);

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: isoTime("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
    updatedAt: isoTime("updated_at").notNull().default(isoNow),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: isoTime("access_token_expires_at"),
    refreshTokenExpiresAt: isoTime("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
    updatedAt: isoTime("updated_at").notNull().default(isoNow),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

// Better Auth's "verification" model, renamed so it is not confused with freelancer verification.
export const authVerification = sqliteTable(
  "auth_verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: isoTime("expires_at").notNull(),
    createdAt: isoTime("created_at").notNull().default(isoNow),
    updatedAt: isoTime("updated_at").notNull().default(isoNow),
  },
  (t) => [index("auth_verification_identifier_idx").on(t.identifier)],
);

// cr-001: atomic, durable auth buckets. Keys never contain raw IP/email values.
export const authRateLimit = sqliteTable(
  "auth_rate_limit",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("auth_rate_limit_expiry_idx").on(t.expiresAt), check("auth_rate_limit_count_check", sql`${t.count} >= 1`)],
);

export const POLICIES = ["privacy", "terms", "freelancer_ack", "client_consent"] as const;
export type Policy = (typeof POLICIES)[number];

// Append-only; triggers in drizzle/0001_triggers.sql reject UPDATE and DELETE (SDD §3.3).
// Application-owned policy authority. Ordinary SQL writes are frozen by migration guards.
export const currentPolicyVersion = sqliteTable("current_policy_version", {
  policy: text("policy", { enum: POLICIES }).primaryKey(),
  version: text("version").notNull(),
}, (t) => [check("current_policy_version_policy_check", sql`${t.policy} IN ('privacy','terms','freelancer_ack','client_consent')`), check("current_policy_version_version_check", sql`length(trim(${t.version}))>0`)]);

export const policyAcceptance = sqliteTable(
  "policy_acceptance",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    policy: text("policy", { enum: POLICIES }).notNull(),
    version: text("version").notNull(),
    acceptedAt: isoTime("accepted_at").notNull().default(isoNow),
    retiredAt: isoTime("retired_at"),
  },
  (t) => [
    index("policy_acceptance_user_idx").on(t.userId, t.policy),
    check("policy_acceptance_policy_check", sql`${t.policy} IN ('privacy','terms','freelancer_ack','client_consent')`),
  ],
);

export const FREELANCER_STATUSES = ["unverified", "pending", "verified", "rejected", "suspended"] as const;
export type FreelancerStatus = (typeof FREELANCER_STATUSES)[number];

export const freelancerProfile = sqliteTable(
  "freelancer_profile",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    city: text("city"),
    status: text("status", { enum: FREELANCER_STATUSES }).notNull().default("unverified"),
    verifiedAt: isoTime("verified_at"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    check("freelancer_profile_status_check", sql`${t.status} IN ('unverified','pending','verified','rejected','suspended')`),
  ],
);

export const VERIFICATION_METHODS = ["live_manual"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export const ID_KINDS = ["philid", "ephilid", "passport", "drivers_licence"] as const;
export type IdKind = (typeof ID_KINDS)[number];

export const VERIFICATION_RESULTS = ["pass", "fail"] as const;
export type VerificationResult = (typeof VERIFICATION_RESULTS)[number];

export const VERIFICATION_DECISIONS = ["approve", "reject"] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

export const verificationCase = sqliteTable(
  "verification_case",
  {
    id: text("id").primaryKey(),
    freelancerId: text("freelancer_id").notNull().references(() => freelancerProfile.userId, { onDelete: "cascade" }),
    submittedProfile: text("submitted_profile"),
    reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "restrict" }),
    method: text("method", { enum: VERIFICATION_METHODS }).notNull().default("live_manual"),
    idKind: text("id_kind", { enum: ID_KINDS }),
    result: text("result", { enum: VERIFICATION_RESULTS }),
    nameMatch: integer("name_match", { mode: "boolean" }),
    inspectedAt: isoTime("inspected_at"),
    decision: text("decision", { enum: VERIFICATION_DECISIONS }),
    reason: text("reason"),
    decidedAt: isoTime("decided_at"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    index("verification_case_freelancer_idx").on(t.freelancerId),
    uniqueIndex("verification_case_open_idx").on(t.freelancerId).where(sql`${t.decidedAt} IS NULL`),
    check("verification_case_method_check", sql`${t.method} = 'live_manual'`),
    check("verification_case_id_kind_check", sql`${t.idKind} IS NULL OR ${t.idKind} IN ('philid','ephilid','passport','drivers_licence')`),
    check("verification_case_result_check", sql`${t.result} IS NULL OR ${t.result} IN ('pass','fail')`),
    check("verification_case_inspection_check", sql`(${t.reviewerId} IS NULL AND ${t.idKind} IS NULL AND ${t.result} IS NULL AND ${t.nameMatch} IS NULL AND ${t.inspectedAt} IS NULL) OR (${t.reviewerId} IS NOT NULL AND ${t.idKind} IS NOT NULL AND ${t.result} IS NOT NULL AND ${t.nameMatch} IS NOT NULL AND typeof(${t.nameMatch}) = 'integer' AND ${t.nameMatch} IN (0,1) AND ${t.inspectedAt} IS NOT NULL)`),
    check("verification_case_decision_check", sql`(${t.decision} IS NULL AND ${t.reason} IS NULL AND ${t.decidedAt} IS NULL) OR (${t.decision} IS NOT NULL AND ${t.decision} IN ('approve','reject') AND ${t.reason} IS NOT NULL AND length(trim(${t.reason}, char(9)||char(10)||char(11)||char(12)||char(13)||' ')) > 0 AND ${t.decidedAt} IS NOT NULL)`),
    check("verification_case_approval_check", sql`${t.decision} IS NULL OR ${t.decision} != 'approve' OR (${t.reviewerId} IS NOT NULL AND ${t.result} IS NOT NULL AND ${t.result} = 'pass' AND ${t.nameMatch} IS NOT NULL AND ${t.nameMatch} = 1)`),
    check("verification_case_time_check", sql`(${t.inspectedAt} IS NULL OR ${t.createdAt} <= ${t.inspectedAt}) AND (${t.decidedAt} IS NULL OR (${t.createdAt} <= ${t.decidedAt} AND (${t.inspectedAt} IS NULL OR ${t.inspectedAt} <= ${t.decidedAt})))`),
  ],
);

export const MODERATION_KINDS = ["verification", "log", "correction", "filer_update"] as const;
export const MODERATION_STATUSES = ["open", "claimed", "decided", "awaiting_changes", "closed"] as const;
export const MODERATION_DECISIONS = ["approve", "ask_changes", "reject", "uphold", "correct", "withdraw"] as const;

export const moderationCase = sqliteTable("moderation_case", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: MODERATION_KINDS }).notNull(),
  subjectId: text("subject_id").notNull(),
  status: text("status", { enum: MODERATION_STATUSES }).notNull().default("open"),
  claimedBy: text("claimed_by").references(() => user.id, { onDelete: "restrict" }),
  claimedUntil: isoTime("claimed_until"),
  decision: text("decision", { enum: MODERATION_DECISIONS }),
  reason: text("reason"),
  decidedBy: text("decided_by").references(() => user.id, { onDelete: "restrict" }),
  decidedAt: isoTime("decided_at"),
  createdAt: isoTime("created_at").notNull().default(isoNow),
  logId: text("log_id").references((): AnySQLiteColumn => engagementLog.id, { onDelete: "restrict" }),
  correctionRequestId: text("correction_request_id").unique().references((): AnySQLiteColumn => correctionRequest.id, { onDelete: "restrict" }),
  closedAt: isoTime("closed_at"),
  closureKind: text("closure_kind", { enum: ["decision", "abandoned", "erased"] }),
}, (t) => [
  uniqueIndex("moderation_case_subject_idx").on(t.kind, t.subjectId),
  index("moderation_case_queue_idx").on(t.kind, t.status, t.createdAt),
  index("moderation_case_closed_idx").on(t.closedAt),
  uniqueIndex("moderation_case_live_initial_idx").on(t.logId).where(sql`${t.kind} = 'log' AND ${t.status} IN ('open','claimed','awaiting_changes')`),
  uniqueIndex("moderation_case_live_update_idx").on(t.logId).where(sql`${t.kind} = 'filer_update' AND ${t.status} IN ('open','claimed','awaiting_changes')`),
  check("moderation_case_kind_check", sql`${t.kind} IN ('verification','log','correction','filer_update')`),
  check("moderation_case_state_check", sql`(${t.status} IN ('open','awaiting_changes') AND ${t.claimedBy} IS NULL AND ${t.claimedUntil} IS NULL AND ${t.decision} IS NULL AND ${t.reason} IS NULL AND ${t.decidedBy} IS NULL AND ${t.decidedAt} IS NULL AND ${t.closedAt} IS NULL AND ${t.closureKind} IS NULL) OR (${t.status} = 'claimed' AND ${t.claimedBy} IS NOT NULL AND ${t.claimedUntil} IS NOT NULL AND ${t.decision} IS NULL AND ${t.reason} IS NULL AND ${t.decidedBy} IS NULL AND ${t.decidedAt} IS NULL AND ${t.closedAt} IS NULL AND ${t.closureKind} IS NULL) OR (${t.status} = 'decided' AND ${t.claimedBy} IS NULL AND ${t.claimedUntil} IS NULL AND ${t.decision} IS NOT NULL AND ${t.reason} IS NOT NULL AND length(trim(${t.reason}, char(9)||char(10)||char(11)||char(12)||char(13)||' ')) > 0 AND ${t.decidedBy} IS NOT NULL AND ${t.decidedAt} IS NOT NULL AND ((${t.closedAt} = ${t.decidedAt} AND ${t.closureKind} = 'decision') OR (${t.kind} = 'verification' AND ${t.closedAt} IS NULL AND ${t.closureKind} IS NULL))) OR (${t.status} = 'closed' AND ${t.claimedBy} IS NULL AND ${t.claimedUntil} IS NULL AND ${t.decision} IS NULL AND ${t.reason} IS NULL AND ${t.decidedBy} IS NULL AND ${t.decidedAt} IS NULL AND ${t.closedAt} IS NOT NULL AND ${t.closureKind} IN ('abandoned','erased'))`),
  check("moderation_case_decision_check", sql`${t.decision} IS NULL OR (${t.kind} = 'verification' AND ${t.decision} IN ('approve','reject')) OR (${t.kind} IN ('log','filer_update') AND ${t.decision} IN ('approve','ask_changes','reject')) OR (${t.kind} = 'correction' AND ${t.decision} IN ('uphold','ask_changes','correct','withdraw'))`),
]);

// No content/metadata field: audit records ids, server-selected actions and time only.
export const auditEvent = sqliteTable("audit_event", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => user.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  createdAt: isoTime("created_at").notNull().default(isoNow),
  moderationCaseId: text("moderation_case_id").references(() => moderationCase.id, { onDelete: "restrict" }),
  retainUntil: isoTime("retain_until"),
}, (t) => [index("audit_event_subject_idx").on(t.subjectType, t.subjectId, t.createdAt)]);

export const portfolioLink = sqliteTable(
  "portfolio_link",
  {
    id: text("id").primaryKey(),
    freelancerId: text("freelancer_id")
      .notNull()
      .references(() => freelancerProfile.userId, { onDelete: "cascade" }),
    url: text("url").notNull(),
    label: text("label"),
  },
  (t) => [
    index("portfolio_link_freelancer_idx").on(t.freelancerId),
  ],
);

export const CLIENT_KINDS = ["individual", "business"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export const clientProfile = sqliteTable(
  "client_profile",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    kind: text("kind", { enum: CLIENT_KINDS }).notNull(),
    city: text("city"),
    registrationNo: text("registration_no"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    index("client_profile_display_name_idx").on(t.displayName),
    check("client_profile_kind_check", sql`${t.kind} IN ('individual','business')`),
  ],
);

export const ENGAGEMENT_STATUSES = ["invited", "accepted", "declined", "expired", "cancelled"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const engagement = sqliteTable(
  "engagement",
  {
    id: text("id").primaryKey(),
    freelancerId: text("freelancer_id")
      .notNull()
      .references(() => freelancerProfile.userId, { onDelete: "restrict" }),
    clientId: text("client_id")
      .references(() => clientProfile.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    clientNameHint: text("client_name_hint").notNull(),
    startedOn: text("started_on").notNull(),
    endedAt: text("ended_at"),
    status: text("status", { enum: ENGAGEMENT_STATUSES }).notNull().default("invited"),
    inviteTokenHash: text("invite_token_hash").notNull().unique(),
    inviteExpiresAt: isoTime("invite_expires_at").notNull(),
    acceptedAt: isoTime("accepted_at"),
    declinedAt: isoTime("declined_at"),
    purposeEndedAt: isoTime("purpose_ended_at"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    index("engagement_freelancer_idx").on(t.freelancerId),
    index("engagement_freelancer_created_idx").on(t.freelancerId, t.createdAt),
    index("engagement_client_idx").on(t.clientId),
    // Target of the log's composite key, so a log always names its engagement's own parties.
    uniqueIndex("engagement_id_parties_idx").on(t.id, t.freelancerId, t.clientId),
    check("engagement_status_check", sql`${t.status} IN ('invited','accepted','declined','expired','cancelled')`),
  ],
);

// PRD-F9: one explicit consent event belongs to exactly one engagement.
// Trigger-enforced account/profile/time consistency and append-only evidence.
export const engagementConsent = sqliteTable("engagement_consent", {
  engagementId: text("engagement_id").primaryKey().references(() => engagement.id, { onDelete: "restrict" }),
  policyAcceptanceId: text("policy_acceptance_id").notNull().unique().references(() => policyAcceptance.id, { onDelete: "restrict" }),
});

// PRD-F2/PRD-F3 foundation (SDD §3.1). Submission, moderation, and retention
// transitions land with their feature handlers and hand-written trigger migrations.
export const LOG_STATUSES = ["draft", "pending", "ask_changes", "published", "hidden", "withdrawn", "rejected", "expired"] as const;
export const ANCHOR_KINDS = ["completed", "terminated", "missed_milestone"] as const;
export const REVISION_KINDS = ["initial", "filer_update", "correction"] as const;
export const LOG_OUTCOMES = ["negative", "mixed", "positive"] as const;
export const REVISION_DECISIONS = ["approve", "ask_changes", "reject", "correct", "withdraw", "uphold"] as const;

export const engagementLog = sqliteTable(
  "engagement_log",
  {
    id: text("id").primaryKey(),
    // Allocated by the future intake handler; UNIQUE prevents reference collisions.
    ref: text("ref").notNull().unique(),
    engagementId: text("engagement_id").notNull().unique().references(() => engagement.id, { onDelete: "restrict" }),
    freelancerId: text("freelancer_id").notNull().references(() => freelancerProfile.userId, { onDelete: "restrict" }),
    clientId: text("client_id").notNull().references(() => clientProfile.id, { onDelete: "restrict" }),
    currentRevisionId: text("current_revision_id").references((): AnySQLiteColumn => logRevision.id, { onDelete: "restrict" }),
    status: text("status", { enum: LOG_STATUSES }).notNull().default("draft"),
    anchorKind: text("anchor_kind", { enum: ANCHOR_KINDS }).notNull(),
    anchorDate: text("anchor_date").notNull(),
    // Legacy NULL falls back to createdAt for the approved 30-day idle-draft cleanup.
    draftUpdatedAt: isoTime("draft_updated_at"),
    firstSubmittedAt: isoTime("first_submitted_at"),
    submittedAt: isoTime("submitted_at"),
    publishedAt: isoTime("published_at"),
    expiresAt: isoTime("expires_at"),
    holdKind: text("hold_kind", { enum: ["review", "legal"] }),
    holdPlacedAt: isoTime("hold_placed_at"),
    holdReleasedAt: isoTime("hold_released_at"),
    nameRetentionUntil: isoTime("name_retention_until"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    index("engagement_log_client_status_published_idx").on(t.clientId, t.status, t.publishedAt),
    foreignKey({ name: "engagement_log_engagement_parties_fk", columns: [t.engagementId, t.freelancerId, t.clientId], foreignColumns: [engagement.id, engagement.freelancerId, engagement.clientId] }).onDelete("restrict"),
    foreignKey({ name: "engagement_log_current_revision_owner_fk", columns: [t.currentRevisionId, t.id], foreignColumns: [logRevision.id, logRevision.logId] }).onDelete("restrict"),
    check("engagement_log_status_check", sql`${t.status} IN ('draft','pending','ask_changes','published','hidden','withdrawn','rejected','expired')`),
    check("engagement_log_anchor_kind_check", sql`${t.anchorKind} IN ('completed','terminated','missed_milestone')`),
    check("engagement_log_hold_kind_check", sql`${t.holdKind} IS NULL OR ${t.holdKind} IN ('review','legal')`),
    check("engagement_log_anchor_date_check", sql`${t.anchorDate} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.anchorDate}, '+0 days') IS ${t.anchorDate}`),
  ],
);

export const logRevision = sqliteTable(
  "log_revision",
  {
    id: text("id").primaryKey(),
    logId: text("log_id").notNull().references((): AnySQLiteColumn => engagementLog.id, { onDelete: "restrict" }),
    revNo: integer("rev_no").notNull(),
    kind: text("kind", { enum: REVISION_KINDS }).notNull(),
    rating: integer("rating").notNull(),
    outcome: text("outcome", { enum: LOG_OUTCOMES }).notNull(),
    facts: text("facts").notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    amountCentavos: integer("amount_centavos"),
    submittedBy: text("submitted_by").notNull().references(() => user.id, { onDelete: "restrict" }),
    submittedAt: isoTime("submitted_at").notNull().default(isoNow),
    decidedBy: text("decided_by").references(() => user.id, { onDelete: "restrict" }),
    decidedAt: isoTime("decided_at"),
    decision: text("decision", { enum: REVISION_DECISIONS }),
    reason: text("reason"),
    draftUpdatedAt: isoTime("draft_updated_at"),
    effectiveOn: text("effective_on"),
    invalidatedAt: isoTime("invalidated_at"),
    state: text("state", { enum: ["draft", "submitted"] }).notNull().default("draft"),
    moderationCaseId: text("moderation_case_id").references(() => moderationCase.id, { onDelete: "restrict" }),
  },
  (t) => [
    uniqueIndex("log_revision_log_rev_no_idx").on(t.logId, t.revNo),
    uniqueIndex("log_revision_id_log_idx").on(t.id, t.logId),
    index("log_revision_activity_idx").on(t.state, t.draftUpdatedAt),
    check("log_revision_state_check", sql`${t.state} IN ('draft','submitted')`),
    check("log_revision_effective_check", sql`${t.effectiveOn} IS NULL OR (${t.effectiveOn} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.effectiveOn}, '+0 days') IS ${t.effectiveOn})`),
    check("log_revision_rev_no_check", sql`typeof(${t.revNo}) = 'integer' AND ${t.revNo} >= 1`),
    check("log_revision_kind_check", sql`${t.kind} IN ('initial','filer_update','correction')`),
    check("log_revision_rating_check", sql`typeof(${t.rating}) = 'integer' AND ${t.rating} BETWEEN 1 AND 5`),
    check("log_revision_outcome_check", sql`(${t.rating} IN (1,2) AND ${t.outcome} = 'negative') OR (${t.rating} = 3 AND ${t.outcome} = 'mixed') OR (${t.rating} IN (4,5) AND ${t.outcome} = 'positive')`),
    // IS rejects NULL from an invalid date, which an ordinary CHECK comparison permits.
    check("log_revision_period_start_check", sql`${t.periodStart} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.periodStart}, '+0 days') IS ${t.periodStart}`),
    check("log_revision_period_end_check", sql`${t.periodEnd} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND date(${t.periodEnd}, '+0 days') IS ${t.periodEnd}`),
    check("log_revision_period_order_check", sql`${t.periodEnd} >= ${t.periodStart}`),
    check("log_revision_amount_check", sql`${t.amountCentavos} IS NULL OR (typeof(${t.amountCentavos}) = 'integer' AND ${t.amountCentavos} >= 0)`),
    check("log_revision_decision_check", sql`${t.decision} IS NULL OR ${t.decision} IN ('approve','ask_changes','reject','correct','withdraw','uphold')`),
  ],
);

export const LOG_TAGS = ["On-time Payment", "Clear Scope", "Responsive", "Professional", "Late Payment", "Non-Payment", "Unresponsive", "Scope Creep"] as const;

export const logTag = sqliteTable(
  "log_tag",
  {
    revisionId: text("revision_id").notNull().references(() => logRevision.id, { onDelete: "restrict" }),
    tag: text("tag", { enum: LOG_TAGS }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.tag] }),
    check("log_tag_tag_check", sql`${t.tag} IN ('On-time Payment','Clear Scope','Responsive','Professional','Late Payment','Non-Payment','Unresponsive','Scope Creep')`),
  ],
);

export const PROOF_OWNER_KINDS = ["filer", "client"] as const;
export const PROOF_KINDS = ["screenshot", "invoice", "agreement", "chat", "other"] as const;
export const PROOF_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const PROOF_STATUSES = ["uploading", "attached", "abandoned", "pending_purge", "purged"] as const;

export const proofFile = sqliteTable(
  "proof_file",
  {
    id: text("id").primaryKey(),
    logId: text("log_id").notNull().references(() => engagementLog.id, { onDelete: "restrict" }),
    revisionId: text("revision_id").references(() => logRevision.id, { onDelete: "restrict" }),
    ownerKind: text("owner_kind", { enum: PROOF_OWNER_KINDS }).notNull(),
    uploadedBy: text("uploaded_by").notNull().references(() => user.id, { onDelete: "restrict" }),
    objectKey: text("object_key").notNull().unique(),
    kind: text("kind", { enum: PROOF_KINDS }).notNull(),
    mime: text("mime", { enum: PROOF_MIMES }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    purgeAttempts: integer("purge_attempts").notNull().default(0),
    purgeInflight: integer("purge_inflight").notNull().default(0),
    writeInflight: integer("write_inflight").notNull().default(0),
    status: text("status", { enum: PROOF_STATUSES }).notNull().default("uploading"),
    uploadedAt: isoTime("uploaded_at").notNull().default(isoNow),
    correctionRequestId: text("correction_request_id").references((): AnySQLiteColumn => correctionRequest.id, { onDelete: "restrict" }),
  },
  (t) => [
    index("proof_file_log_idx").on(t.logId),
    index("proof_file_revision_idx").on(t.revisionId),
    index("proof_file_status_uploaded_idx").on(t.status, t.uploadedAt),
    foreignKey({ name: "proof_file_revision_owner_fk", columns: [t.revisionId, t.logId], foreignColumns: [logRevision.id, logRevision.logId] }).onDelete("restrict"),
    check("proof_file_owner_kind_check", sql`${t.ownerKind} IN ('filer','client')`),
    check("proof_file_kind_check", sql`${t.kind} IN ('screenshot','invoice','agreement','chat','other')`),
    check("proof_file_mime_check", sql`${t.mime} IN ('image/jpeg','image/png','image/webp','application/pdf')`),
    check("proof_file_size_check", sql`typeof(${t.sizeBytes}) = 'integer' AND ${t.sizeBytes} BETWEEN 1 AND 10485760`),
    check("proof_file_purge_attempts_check", sql`typeof(${t.purgeAttempts}) = 'integer' AND ${t.purgeAttempts} BETWEEN 0 AND 9007199254740991`),
    check("proof_file_purge_inflight_check", sql`typeof(${t.purgeInflight}) = 'integer' AND ${t.purgeInflight} IN (0,1)`),
    check("proof_file_writer_check", sql`${t.writeInflight} IN (0,1)`),
    check("proof_file_status_check", sql`${t.status} IN ('uploading','attached','abandoned','pending_purge','purged')`),
  ],
);

// Pilot lifecycle/review contract: SDD §§3.8–3.12. SQL triggers enforce
// relationship, actor, immutable-history and exact maintenance authority.
export const correctionRequest = sqliteTable("correction_request", {
  id: text("id").primaryKey(),
  logId: text("log_id").references(() => engagementLog.id, { onDelete: "restrict" }),
  subjectRef: text("subject_ref").notNull(),
  requestedBy: text("requested_by").notNull().references(() => user.id, { onDelete: "restrict" }),
  baseRevisionId: text("base_revision_id").references(() => logRevision.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["draft", "submitted", "ask_changes", "closed", "abandoned"] }).notNull().default("draft"),
  newEvidenceNote: text("new_evidence_note").notNull(),
  activeProofIds: text("active_proof_ids").notNull().default("[]"),
  createdAt: isoTime("created_at").notNull().default(isoNow),
  updatedAt: isoTime("updated_at").notNull().default(isoNow),
  submittedAt: isoTime("submitted_at"),
  closedAt: isoTime("closed_at"),
  hiddenAt: isoTime("hidden_at"),
  hiddenBy: text("hidden_by").references(() => user.id, { onDelete: "restrict" }),
  hideReason: text("hide_reason"),
  restoredAt: isoTime("restored_at"),
}, (t) => [
  uniqueIndex("correction_request_live_log_idx").on(t.logId).where(sql`${t.status} IN ('draft','submitted','ask_changes')`),
  index("correction_request_subject_idx").on(t.subjectRef, t.closedAt),
  check("correction_request_active_proofs_check", sql`json_valid(${t.activeProofIds}) AND json_type(${t.activeProofIds})='array' AND json_array_length(${t.activeProofIds})<=5`),
  check("correction_request_status_check", sql`${t.status} IN ('draft','submitted','ask_changes','closed','abandoned')`),
  check("correction_request_close_check", sql`(${t.status} IN ('closed','abandoned') AND ${t.closedAt} IS NOT NULL) OR (${t.status} IN ('draft','submitted','ask_changes') AND ${t.closedAt} IS NULL AND ${t.logId} IS NOT NULL)`),
  check("correction_request_hide_check", sql`(${t.hiddenAt} IS NULL AND ${t.hiddenBy} IS NULL AND ${t.hideReason} IS NULL AND ${t.restoredAt} IS NULL) OR (${t.hiddenAt} IS NOT NULL AND ${t.hiddenBy} IS NOT NULL AND length(trim(${t.hideReason})) > 0)`),
]);

export const reviewRound = sqliteTable("review_round", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => moderationCase.id, { onDelete: "restrict" }),
  roundNo: integer("round_no").notNull(),
  revisionId: text("revision_id").references(() => logRevision.id, { onDelete: "restrict" }),
  reviewerId: text("reviewer_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  decision: text("decision", { enum: MODERATION_DECISIONS }).notNull(),
  reason: text("reason").notNull(),
  decidedAt: isoTime("decided_at").notNull(),
}, (t) => [
  uniqueIndex("review_round_case_number_idx").on(t.caseId, t.roundNo),
  check("review_round_number_check", sql`typeof(${t.roundNo})='integer' AND ${t.roundNo}>=1`),
  check("review_round_decision_check", sql`${t.decision} IN ('approve','ask_changes','reject','uphold','correct','withdraw')`),
  check("review_round_reason_check", sql`length(trim(${t.reason}))>0`),
]);

export const proofReview = sqliteTable("proof_review", {
  id: text("id").primaryKey(),
  roundId: text("round_id").notNull().references(() => reviewRound.id, { onDelete: "restrict" }),
  proofId: text("proof_id").references(() => proofFile.id, { onDelete: "restrict" }),
  proofSha256: text("proof_sha256").notNull(),
  verdict: text("verdict", { enum: ["accepted", "rejected"] }).notNull(),
  reason: text("reason").notNull(),
  reviewedAt: isoTime("reviewed_at").notNull(),
}, (t) => [
  uniqueIndex("proof_review_round_proof_idx").on(t.roundId, t.proofId),
  check("proof_review_verdict_check", sql`${t.verdict} IN ('accepted','rejected')`),
  check("proof_review_reason_check", sql`length(trim(${t.reason}))>0`),
]);

export const revisionProof = sqliteTable("revision_proof", {
  revisionId: text("revision_id").notNull().references(() => logRevision.id, { onDelete: "restrict" }),
  proofId: text("proof_id").notNull().references(() => proofFile.id, { onDelete: "restrict" }),
}, (t) => [primaryKey({ columns: [t.revisionId, t.proofId] })]);

export const PRIVACY_REQUEST_KINDS = ["export", "correction", "deletion", "closure"] as const;
export const PRIVACY_REQUEST_STATUSES = ["received", "assessing", "executing", "completed", "deferred", "denied"] as const;
export const privacyRequest = sqliteTable("privacy_request", {
  id: text("id").primaryKey(),
  subjectUserId: text("subject_user_id").references(() => user.id, { onDelete: "restrict" }),
  responsibleId: text("responsible_id").references(() => user.id, { onDelete: "restrict" }),
  kind: text("kind", { enum: PRIVACY_REQUEST_KINDS }).notNull(),
  receivedAt: isoTime("received_at").notNull(),
  dueAt: isoTime("due_at").notNull(),
  identityVerifiedAt: isoTime("identity_verified_at"),
  status: text("status", { enum: PRIVACY_REQUEST_STATUSES }).notNull().default("received"),
  scope: text("scope").notNull(),
  assessment: text("assessment"),
  outcome: text("outcome"),
  deactivatedAt: isoTime("deactivated_at"),
  assessedAt: isoTime("assessed_at"),
  closedAt: isoTime("closed_at"),
}, (t) => [
  index("privacy_request_due_idx").on(t.status, t.dueAt),
  check("privacy_request_kind_check", sql`${t.kind} IN ('export','correction','deletion','closure')`),
  check("privacy_request_status_check", sql`${t.status} IN ('received','assessing','executing','completed','deferred','denied')`),
  check("privacy_request_scope_check", sql`json_valid(${t.scope}) AND json_type(${t.scope})='object'`),
  check("privacy_request_assessment_check", sql`${t.assessment} IS NULL OR (json_valid(${t.assessment}) AND json_type(${t.assessment})='object')`),
  check("privacy_request_due_check", sql`julianday(${t.dueAt}) IS NOT NULL AND ${t.dueAt}>=${t.receivedAt} AND (${t.kind}!='closure' OR julianday(${t.dueAt})<=julianday(${t.receivedAt})+30)`),
]);

export const HOLD_TARGET_TYPES = ["user", "log", "revision", "proof", "case", "policy", "request", "audit"] as const;
export const retentionHold = sqliteTable("retention_hold", {
  id: text("id").primaryKey(),
  targetType: text("target_type", { enum: HOLD_TARGET_TYPES }).notNull(),
  targetId: text("target_id").notNull(),
  kind: text("kind", { enum: ["review", "legal"] }).notNull(),
  responsibleId: text("responsible_id").notNull().references(() => user.id, { onDelete: "restrict" }),
  reason: text("reason").notNull(),
  placedAt: isoTime("placed_at").notNull(),
  reviewDueAt: isoTime("review_due_at").notNull(),
  expiresAt: isoTime("expires_at").notNull(),
  releasedAt: isoTime("released_at"),
}, (t) => [
  index("retention_hold_target_idx").on(t.targetType, t.targetId, t.expiresAt),
  check("retention_hold_type_check", sql`${t.targetType} IN ('user','log','revision','proof','case','policy','request','audit')`),
  check("retention_hold_kind_check", sql`${t.kind} IN ('review','legal')`),
  check("retention_hold_reason_check", sql`length(trim(${t.reason}))>0`),
  check("retention_hold_time_check", sql`julianday(${t.placedAt}) IS NOT NULL AND julianday(${t.reviewDueAt}) IS NOT NULL AND julianday(${t.expiresAt}) IS NOT NULL AND ${t.placedAt}<=${t.reviewDueAt} AND ${t.reviewDueAt}<=${t.expiresAt} AND (${t.releasedAt} IS NULL OR (julianday(${t.releasedAt}) IS NOT NULL AND ${t.releasedAt}>=${t.placedAt}))`),
]);

export const MAINTENANCE_OPERATIONS = ["purge", "redact_identity", "retire_policy", "close_abandoned"] as const;
export const MAINTENANCE_BASES = ["retention_due", "assessed_erasure", "account_closure"] as const;
export const MAINTENANCE_STATUSES = ["planned", "claimed", "blocked", "completed", "abandoned"] as const;
export const maintenanceTask = sqliteTable("maintenance_task", {
  id: text("id").primaryKey(),
  privacyRequestId: text("privacy_request_id").references(() => privacyRequest.id, { onDelete: "restrict" }),
  authorizedBy: text("authorized_by").references(() => user.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  operation: text("operation", { enum: MAINTENANCE_OPERATIONS }).notNull(),
  basis: text("basis", { enum: MAINTENANCE_BASES }).notNull(),
  dueAt: isoTime("due_at").notNull(),
  authorizedAt: isoTime("authorized_at").notNull(),
  authorizationExpiresAt: isoTime("authorization_expires_at").notNull(),
  status: text("status", { enum: MAINTENANCE_STATUSES }).notNull().default("planned"),
  claimedAt: isoTime("claimed_at"),
  attempts: integer("attempts").notNull().default(0),
  completedAt: isoTime("completed_at"),
  retainUntil: isoTime("retain_until"),
}, (t) => [
  uniqueIndex("maintenance_task_live_idx").on(t.targetType, t.targetId, t.operation).where(sql`${t.status} IN ('planned','claimed','blocked')`),
  index("maintenance_task_due_idx").on(t.status, t.dueAt, t.attempts),
  check("maintenance_task_operation_check", sql`${t.operation} IN ('purge','redact_identity','retire_policy','close_abandoned')`),
  check("maintenance_task_basis_check", sql`${t.basis} IN ('retention_due','assessed_erasure','account_closure')`),
  check("maintenance_task_status_check", sql`${t.status} IN ('planned','claimed','blocked','completed','abandoned')`),
  check("maintenance_task_attempts_check", sql`typeof(${t.attempts})='integer' AND ${t.attempts}>=0`),
  check("maintenance_task_authorization_check", sql`julianday(${t.authorizedAt}) IS NOT NULL AND julianday(${t.authorizationExpiresAt}) IS NOT NULL AND julianday(${t.dueAt}) IS NOT NULL AND ${t.authorizedAt}<${t.authorizationExpiresAt} AND (julianday(${t.authorizationExpiresAt})-julianday(${t.authorizedAt}))*86400<=3600.001`),
]);

export const exportDelivery = sqliteTable("export_delivery", {
  id: text("id").primaryKey(),
  privacyRequestId: text("privacy_request_id").notNull().references(() => privacyRequest.id, { onDelete: "restrict" }),
  authKind: text("auth_kind", { enum: ["session", "assessed_capability"] }).notNull(),
  objectKey: text("object_key").unique(),
  tokenHash: text("token_hash").unique(),
  writeInflight: integer("write_inflight").notNull().default(0),
  createdAt: isoTime("created_at").notNull(),
  expiresAt: isoTime("expires_at").notNull(),
  downloadedAt: isoTime("downloaded_at"),
  purgedAt: isoTime("purged_at"),
}, (t) => [
  check("export_delivery_auth_check", sql`${t.authKind} IN ('session','assessed_capability')`),
  check("export_delivery_writer_check", sql`${t.writeInflight} IN (0,1) AND (${t.writeInflight}=0 OR ${t.objectKey} IS NOT NULL AND ${t.purgedAt} IS NULL AND ${t.downloadedAt} IS NULL)`),
  check("export_delivery_time_check", sql`julianday(${t.createdAt}) IS NOT NULL AND julianday(${t.expiresAt}) IS NOT NULL AND ${t.createdAt}<${t.expiresAt} AND julianday(${t.expiresAt})<=julianday(${t.createdAt})+1`),
]);

export const backupDisposition = sqliteTable("backup_disposition", {
  id: text("id").primaryKey(),
  privacyRequestId: text("privacy_request_id").references(() => privacyRequest.id, { onDelete: "restrict" }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  backupRef: text("backup_ref").notNull(),
  action: text("action", { enum: ["erase", "expire", "restore_filter"] }).notNull(),
  basis: text("basis").notNull(),
  dueAt: isoTime("due_at").notNull(),
  status: text("status", { enum: ["pending", "verified"] }).notNull().default("pending"),
  verifiedAt: isoTime("verified_at"),
}, (t) => [
  index("backup_disposition_due_idx").on(t.status, t.dueAt),
  check("backup_disposition_action_check", sql`${t.action} IN ('erase','expire','restore_filter')`),
  check("backup_disposition_time_check", sql`julianday(${t.dueAt}) IS NOT NULL AND ((${t.status}='pending' AND ${t.verifiedAt} IS NULL) OR (${t.status}='verified' AND julianday(${t.verifiedAt}) IS NOT NULL))`),
  check("backup_disposition_basis_check", sql`length(trim(${t.basis}))>0`),
]);

