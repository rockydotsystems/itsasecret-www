import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, primaryKey, unique, index } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  password_hash: text().notNull(),
  kdf_salt: text().notNull(),
  kdf_params: text().notNull(),
  email_verified_at: timestamp('email_verified_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`now()`),
})

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
  // unchanged — the 90-day purge still runs off deleted_at.
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
  // unchanged — the 90-day purge still runs off deleted_at.
  hidden_at: timestamp('hidden_at', { withTimezone: true }),
}, (t) => [
  unique().on(t.env_id, t.key),
  index('idx_secrets_env').on(t.env_id),
])

// Prior values of secrets, written on every update/delete. Values are the
// org-key ciphertexts as stored — never plaintext. Purged after 7 days.
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
  session_pubkey: text().notNull(),
  encrypted_org_keys: text().notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
  index('idx_sessions_user').on(t.user_id),
  index('idx_sessions_expires').on(t.expires_at),
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
export type Project = typeof projects.$inferSelect
export type Environment = typeof environments.$inferSelect
export type EnvVar = typeof envVars.$inferSelect
export type Secret = typeof secrets.$inferSelect
export type SecretHistory = typeof secretHistory.$inferSelect
export type EnvVarHistory = typeof envVarHistory.$inferSelect
export type EnvPermission = typeof envPermissions.$inferSelect
export type Session = typeof sessions.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
export type UserLastOrg = typeof userLastOrg.$inferSelect
export type UserLastProject = typeof userLastProject.$inferSelect
export type UserLastEnv = typeof userLastEnv.$inferSelect
