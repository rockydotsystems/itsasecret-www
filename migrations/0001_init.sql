-- itsasecret D1 schema — initial migration
-- Single shared database for all orgs. Soft-delete via deleted_at on
-- retention-sensitive tables. No ON DELETE CASCADE.

-- ─── users ────────────────────────────────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  -- Argon2id hash of password (for login verification)
  password_hash TEXT NOT NULL,
  -- base64 salt for the KDF
  kdf_salt      TEXT NOT NULL,
  -- JSON: { m: memoryKiB, t: iterations, p: parallelism }
  kdf_params    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ─── orgs ─────────────────────────────────────────────────────────
CREATE TABLE orgs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- 'personal' | 'shared'
  kind          TEXT NOT NULL DEFAULT 'shared',
  owner_user_id TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

-- ─── org_members ──────────────────────────────────────────────────
CREATE TABLE org_members (
  org_id           TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  -- 'owner' | 'admin' | 'member'
  role             TEXT NOT NULL DEFAULT 'member',
  -- org shared key, wrapped (AES-GCM) with the user's password-derived key
  -- base64: nonce + ciphertext
  wrapped_org_key  TEXT NOT NULL,
  invited_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (org_id, user_id),
  FOREIGN KEY (org_id) REFERENCES orgs(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (invited_by) REFERENCES users(id)
);

-- ─── projects ─────────────────────────────────────────────────────
CREATE TABLE projects (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NOT NULL,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE (org_id, name),
  FOREIGN KEY (org_id) REFERENCES orgs(id)
);

-- ─── environments ─────────────────────────────────────────────────
CREATE TABLE environments (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  name           TEXT NOT NULL,
  -- nullable: parent environment this was forked from
  parent_env_id  TEXT,
  created_by     TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at     TEXT,
  UNIQUE (project_id, name),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (parent_env_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ─── env_vars (plain, not encrypted) ──────────────────────────────
CREATE TABLE env_vars (
  id         TEXT PRIMARY KEY,
  env_id     TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT,
  UNIQUE (env_id, key),
  FOREIGN KEY (env_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ─── secrets (encrypted at rest with org shared key) ──────────────
CREATE TABLE secrets (
  id              TEXT PRIMARY KEY,
  env_id          TEXT NOT NULL,
  key             TEXT NOT NULL,
  -- base64: nonce + ciphertext (AES-GCM with org shared key)
  encrypted_value TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at      TEXT,
  UNIQUE (env_id, key),
  FOREIGN KEY (env_id) REFERENCES environments(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- ─── env_permissions (RBAC: read | write | admin) ─────────────────
CREATE TABLE env_permissions (
  env_id     TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  -- 'read' | 'write' | 'admin'
  role       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (env_id, user_id),
  FOREIGN KEY (env_id) REFERENCES environments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ─── sessions (server-side, revocable) ────────────────────────────
CREATE TABLE sessions (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  -- hash of the session token; token itself never stored
  token_hash       TEXT NOT NULL UNIQUE,
  -- ECDH ephemeral public key (base64) for session transport encryption
  session_pubkey   TEXT NOT NULL,
  -- JSON: { orgId: encryptedOrgKey(base64) }
  -- org shared keys encrypted with the ECDH-derived session key
  encrypted_org_keys TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at        TEXT NOT NULL,
  revoked_at        TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ─── audit_log ────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id           TEXT PRIMARY KEY,
  org_id       TEXT,
  actor_user_id TEXT,
  -- e.g. 'secret.create', 'env.fork', 'member.invite'
  action       TEXT NOT NULL,
  target_type  TEXT,
  target_id    TEXT,
  -- JSON metadata
  metadata     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (org_id) REFERENCES orgs(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

-- ─── indexes ──────────────────────────────────────────────────────
CREATE INDEX idx_org_members_user     ON org_members(user_id);
CREATE INDEX idx_projects_org         ON projects(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_envs_project         ON environments(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_envs_parent          ON environments(parent_env_id);
CREATE INDEX idx_env_vars_env         ON env_vars(env_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_secrets_env          ON secrets(env_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_env_perms_user       ON env_permissions(user_id);
CREATE INDEX idx_sessions_user        ON sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires     ON sessions(expires_at) WHERE revoked_at IS NULL;
CREATE INDEX idx_audit_org_created    ON audit_log(org_id, created_at);
