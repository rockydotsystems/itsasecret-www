import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, integer, primaryKey, unique, uniqueIndex, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text().primaryKey(),
  // Case-insensitive uniqueness is enforced by the lower(email) index below;
  // the plain unique stays (subsumed by it) because register.ts maps its
  // constraint name to a friendly 409.
  email: text().notNull().unique(),
  // Display name, shown in the UI and on avatars. Optional - accounts are
  // email-first and the profile page fills this in later.
  name: text(),
  password_hash: text().notNull(),
  kdf_salt: text().notNull(),
  kdf_params: text().notNull(),
  email_verified_at: timestamp('email_verified_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  uniqueIndex('idx_users_email_lower').on(sql`lower(${t.email})`),
])

export const emailVerifications = pgTable('email_verifications', {
  id: text().primaryKey(),
  user_id: text().notNull().references(() => users.id),
  token_hash: text().notNull().unique(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  verified_at: timestamp('verified_at', { withTimezone: true }),
}, (t) => [
  index('idx_email_verifications_user').on(t.user_id),
])

export const orgs = pgTable('orgs', {
  id: text().primaryKey(),
  name: text().notNull(),
  kind: text().notNull().default('shared'),
  // 'free' | 'team' - see lib/plans.ts. Personal orgs are always free. Kept
  // on the org row (not derived from the subscription) so limit checks never
  // depend on Stripe state; webhooks + checkout keep it in sync.
  plan: text().notNull().default('free'),
  owner_user_id: text().notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
})

export const orgMembers = pgTable('org_members', {
  org_id: text().notNull().references(() => orgs.id),
  user_id: text().notNull().references(() => users.id),
  role: text().notNull().default('member'),
  wrapped_org_key: text().notNull(),
  invited_by: text().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.org_id, t.user_id] }),
  index('idx_org_members_user').on(t.user_id),
])

// Pending invitations to join an org, emailed as a single-use accept link.
// The invite carries the org key wrapped under the server secret ("pending:")
// so acceptance can create the member row without the inviter being online;
// the invitee's next login re-wraps it under their master key. Only the
// SHA-256 hash of the emailed token is stored (same pattern as sessions).
export const orgInvites = pgTable('org_invites', {
  id: text().primaryKey(),
  org_id: text().notNull().references(() => orgs.id),
  // Normalized to lowercase at the API boundary so re-invites and accept-time
  // matching are case-insensitive.
  email: text().notNull(),
  role: text().notNull().default('member'),
  token_hash: text().notNull().unique(),
  wrapped_org_key: text().notNull(),
  invited_by: text().notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  accepted_at: timestamp('accepted_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  index('idx_org_invites_org').on(t.org_id),
  index('idx_org_invites_email').on(t.email),
  // One pending invite per (org, email), case-insensitive, enforced at the
  // DB level so racing invite creates cannot double up.
  uniqueIndex('idx_org_invites_pending_email').on(t.org_id, sql`lower(${t.email})`).where(sql`accepted_at IS NULL AND revoked_at IS NULL`),
])

// One row per org that has ever opened checkout - the billing state Stripe
// webhooks keep in sync. stripe_customer_id survives a canceled subscription
// so a re-subscribe reuses the same customer/payment method. No CASCADE: a
// soft-deleted org keeps its row (used to cancel via the Stripe API), and the
// 90-day purge leaves billing rows for bookkeeping.
export const billingSubscriptions = pgTable('billing_subscriptions', {
  id: text().primaryKey(),
  org_id: text().notNull().unique().references(() => orgs.id),
  stripe_customer_id: text().notNull().unique(),
  // Null until the first checkout session completes and Stripe assigns the
  // subscription id via webhook.
  stripe_subscription_id: text().unique(),
  status: text().notNull().default('incomplete'),
  // Stripe subscription item quantity = billable seats (members minus the one
  // free super-user, min 1). Kept in sync on member add/remove.
  seat_count: integer('seat_count').notNull().default(1),
  current_period_end: timestamp('current_period_end', { withTimezone: true }),
  cancel_at_period_end: boolean('cancel_at_period_end').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('idx_billing_subscriptions_org').on(t.org_id),
])

// Stripe webhook delivery is at-least-once; this table is the idempotency
// ledger. Event ids are inserted before handling, unique-violation = replay.
export const billingEvents = pgTable('billing_events', {
  id: text().primaryKey(),
  type: text().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export const projects = pgTable('projects', {
  id: text().primaryKey(),
  org_id: text().notNull().references(() => orgs.id),
  name: text().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  unique().on(t.org_id, t.name),
  index('idx_projects_org').on(t.org_id),
])

let environmentsRef: any

export const environments = pgTable('environments', {
  id: text().primaryKey(),
  project_id: text().notNull().references(() => projects.id),
  name: text().notNull(),
  parent_env_id: text().references(() => environmentsRef.id),
  created_by: text().notNull().references(() => users.id),
  // Opt-in "this is live" marker: the UI shows a visual indicator on live
  // environments so nobody edits one by accident.
  is_live: boolean('is_live').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  unique().on(t.project_id, t.name),
  index('idx_envs_project').on(t.project_id),
  index('idx_envs_parent').on(t.parent_env_id),
])

environmentsRef = environments

export const envVars = pgTable('env_vars', {
  id: text().primaryKey(),
  env_id: text().notNull().references(() => environments.id),
  key: text().notNull(),
  value: text().notNull(),
  created_by: text().notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  // "Perma delete": hides the row from the recently-deleted UI. Retention is
  // unchanged - the 90-day purge still runs off deleted_at.
  hidden_at: timestamp('hidden_at', { withTimezone: true }),
}, (t) => [
  unique().on(t.env_id, t.key),
  index('idx_env_vars_env').on(t.env_id),
])

export const secrets = pgTable('secrets', {
  id: text().primaryKey(),
  env_id: text().notNull().references(() => environments.id),
  key: text().notNull(),
  encrypted_value: text().notNull(),
  created_by: text().notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
  // "Perma delete": hides the row from the recently-deleted UI. Retention is
  // unchanged - the 90-day purge still runs off deleted_at.
  hidden_at: timestamp('hidden_at', { withTimezone: true }),
}, (t) => [
  unique().on(t.env_id, t.key),
  index('idx_secrets_env').on(t.env_id),
])

// Prior values of secrets, written on every update/delete. Values are the
// org-key ciphertexts as stored - never plaintext. Purged after 7 days.
export const secretHistory = pgTable('secret_history', {
  id: text().primaryKey(),
  secret_id: text().notNull().references(() => secrets.id),
  env_id: text().notNull().references(() => environments.id),
  key: text().notNull(),
  encrypted_value: text().notNull(),
  change_type: text().notNull(),
  changed_by: text().notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('idx_secret_history_secret').on(t.secret_id),
  index('idx_secret_history_created').on(t.created_at),
])

// Prior values of plain env vars. The live value is plaintext by design, but
// history rows are encrypted at rest under the server secret. Purged after 7 days.
export const envVarHistory = pgTable('env_var_history', {
  id: text().primaryKey(),
  var_id: text().notNull().references(() => envVars.id),
  env_id: text().notNull().references(() => environments.id),
  key: text().notNull(),
  encrypted_value: text().notNull(),
  change_type: text().notNull(),
  changed_by: text().notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('idx_env_var_history_var').on(t.var_id),
  index('idx_env_var_history_created').on(t.created_at),
])

// Teams are an authorization-only grouping of org members - there are no
// per-team keys; the org key stays the sole crypto boundary. Grants given to
// a team are inherited by its members (additive max-wins, no deny rules).
// See docs/teams-design.md.
export const teams = pgTable('teams', {
  id: text().primaryKey(),
  org_id: text().notNull().references(() => orgs.id),
  name: text().notNull(),
  created_by: text().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
  // Partial so a deleted team's name is reusable during the purge window.
  uniqueIndex('idx_teams_org_name_live').on(t.org_id, t.name).where(sql`deleted_at IS NULL`),
  index('idx_teams_org').on(t.org_id),
])

export const teamMembers = pgTable('team_members', {
  team_id: text().notNull().references(() => teams.id),
  user_id: text().notNull().references(() => users.id),
  added_by: text().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.team_id, t.user_id] }),
  index('idx_team_members_user').on(t.user_id),
])

export const teamEnvPermissions = pgTable('team_env_permissions', {
  env_id: text().notNull().references(() => environments.id),
  team_id: text().notNull().references(() => teams.id),
  role: text().notNull(),
  granted_by: text().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.env_id, t.team_id] }),
  index('idx_team_env_perms_team').on(t.team_id),
])

// Covers every env in the project, present and future - forks included.
export const teamProjectPermissions = pgTable('team_project_permissions', {
  project_id: text().notNull().references(() => projects.id),
  team_id: text().notNull().references(() => teams.id),
  role: text().notNull(),
  granted_by: text().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.project_id, t.team_id] }),
  index('idx_team_project_perms_team').on(t.team_id),
])

export const envPermissions = pgTable('env_permissions', {
  env_id: text().notNull().references(() => environments.id),
  user_id: text().notNull().references(() => users.id),
  role: text().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.env_id, t.user_id] }),
  index('idx_env_perms_user').on(t.user_id),
])

export const sessions = pgTable('sessions', {
  id: text().primaryKey(),
  user_id: text().notNull().references(() => users.id),
  token_hash: text().notNull().unique(),
  // 'web' sessions live 7 days on a stable token; 'cli' sessions live 30
  // minutes and roll - each successful request issues a new token, with the
  // previous one honored briefly (crash/parallel safety).
  kind: text().notNull().default('web'),
  // Display name for long-lived access tokens ('token' kind); null for
  // ordinary web/cli sessions.
  name: text(),
  prev_token_hash: text(),
  prev_token_expires_at: timestamp('prev_token_expires_at', { withTimezone: true }),
  session_pubkey: text().notNull(),
  encrypted_org_keys: text().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  // Throttled touch by requireAuth: backs the web idle timeout and the
  // "last used" column on the tokens page.
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  index('idx_sessions_user').on(t.user_id),
  index('idx_sessions_expires').on(t.expires_at),
  index('idx_sessions_prev_token').on(t.prev_token_hash),
])

export const userLastOrg = pgTable('user_last_org', {
  user_id: text().primaryKey().references(() => users.id),
  org_id: text().notNull().references(() => orgs.id),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

export const userLastProject = pgTable('user_last_project', {
  user_id: text().notNull().references(() => users.id),
  org_id: text().notNull().references(() => orgs.id),
  project_id: text().notNull().references(() => projects.id),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.org_id] }),
])

export const userLastEnv = pgTable('user_last_env', {
  user_id: text().notNull().references(() => users.id),
  project_id: text().notNull().references(() => projects.id),
  env_id: text().notNull().references(() => environments.id),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.project_id] }),
])

// Product feedback submitted from the profile page. Kept forever (tiny table,
// no retention concerns); also forwarded by email best-effort.
export const feedback = pgTable('feedback', {
  id: text().primaryKey(),
  user_id: text().notNull().references(() => users.id),
  message: text().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('idx_feedback_user').on(t.user_id),
])

export const auditLog = pgTable('audit_log', {
  id: text().primaryKey(),
  org_id: text().references(() => orgs.id),
  actor_user_id: text().references(() => users.id),
  action: text().notNull(),
  target_type: text(),
  target_id: text(),
  metadata: text(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => [
  index('idx_audit_org_created').on(t.org_id, t.created_at),
])

export type User = typeof users.$inferSelect
export type EmailVerification = typeof emailVerifications.$inferSelect
export type Org = typeof orgs.$inferSelect
export type OrgMember = typeof orgMembers.$inferSelect
export type OrgInvite = typeof orgInvites.$inferSelect
export type BillingSubscription = typeof billingSubscriptions.$inferSelect
export type BillingEvent = typeof billingEvents.$inferSelect
export type Project = typeof projects.$inferSelect
export type Environment = typeof environments.$inferSelect
export type EnvVar = typeof envVars.$inferSelect
export type Secret = typeof secrets.$inferSelect
export type SecretHistory = typeof secretHistory.$inferSelect
export type EnvVarHistory = typeof envVarHistory.$inferSelect
export type EnvPermission = typeof envPermissions.$inferSelect
export type Team = typeof teams.$inferSelect
export type TeamMember = typeof teamMembers.$inferSelect
export type TeamEnvPermission = typeof teamEnvPermissions.$inferSelect
export type TeamProjectPermission = typeof teamProjectPermissions.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Feedback = typeof feedback.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type UserLastOrg = typeof userLastOrg.$inferSelect
export type UserLastProject = typeof userLastProject.$inferSelect
export type UserLastEnv = typeof userLastEnv.$inferSelect
