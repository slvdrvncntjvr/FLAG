// Schema contract: docs/sdd-flag.md §3.1. Add an entity here only after the ERD has it.
// Timestamps are ISO-8601 text and booleans are 0/1 integers (SDD §3).
import { sql } from "drizzle-orm";
import { check, customType, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const POLICIES = ["privacy", "terms", "freelancer_ack", "client_consent"] as const;
export type Policy = (typeof POLICIES)[number];

// Append-only; triggers in drizzle/0001_triggers.sql reject UPDATE and DELETE (SDD §3.3).
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
    freelancerId: text("freelancer_id")
      .notNull()
      .references(() => freelancerProfile.userId, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    method: text("method", { enum: VERIFICATION_METHODS }).notNull().default("live_manual"),
    idKind: text("id_kind", { enum: ID_KINDS }).notNull(),
    result: text("result", { enum: VERIFICATION_RESULTS }).notNull(),
    nameMatch: integer("name_match", { mode: "boolean" }).notNull(),
    inspectedAt: isoTime("inspected_at").notNull().default(isoNow),
    decision: text("decision", { enum: VERIFICATION_DECISIONS }),
    reason: text("reason"),
    decidedAt: isoTime("decided_at"),
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    index("verification_case_freelancer_idx").on(t.freelancerId),
    check("verification_case_method_check", sql`${t.method} = 'live_manual'`),
    check("verification_case_id_kind_check", sql`${t.idKind} IN ('philid','ephilid','passport','drivers_licence')`),
    check("verification_case_result_check", sql`${t.result} IN ('pass','fail')`),
    check("verification_case_decision_check", sql`${t.decision} IS NULL OR ${t.decision} IN ('approve','reject')`),
  ],
);

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
    createdAt: isoTime("created_at").notNull().default(isoNow),
  },
  (t) => [
    index("engagement_freelancer_idx").on(t.freelancerId),
    index("engagement_client_idx").on(t.clientId),
    check("engagement_status_check", sql`${t.status} IN ('invited','accepted','declined','expired','cancelled')`),
  ],
);

