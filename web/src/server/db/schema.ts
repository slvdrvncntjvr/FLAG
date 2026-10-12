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
