export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  kdf_salt: string;
  kdf_params: string;
  created_at: string;
  updated_at: string;
}

export interface OrgRow {
  id: string;
  name: string;
  kind: string;
  owner_user_id: string;
  created_at: string;
  deleted_at: string | null;
}

export interface OrgMemberRow {
  org_id: string;
  user_id: string;
  role: string;
  wrapped_org_key: string;
  invited_by: string | null;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
  deleted_at: string | null;
}

export interface EnvRow {
  id: string;
  project_id: string;
  name: string;
  parent_env_id: string | null;
  created_by: string;
  created_at: string;
  deleted_at: string | null;
}

export interface EnvVarRow {
  id: string;
  env_id: string;
  key: string;
  value: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SecretRow {
  id: string;
  env_id: string;
  key: string;
  encrypted_value: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface EnvPermissionRow {
  env_id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  session_pubkey: string;
  encrypted_org_keys: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface AuthContext {
  user: UserRow;
  session: SessionRow;
  orgId?: string;
}
