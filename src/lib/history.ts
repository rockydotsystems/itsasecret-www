import { db } from './db'
import { secretHistory, envVarHistory } from './schema'
import { generateId } from './db-utils'
import { encrypt } from './crypto/envelope'
import { getServerSecretKey } from './server-secret'

export type HistoryChangeType = 'update' | 'delete'

// Snapshots the previous value of a secret. The value is the org-key
// ciphertext exactly as stored, so history stays end-to-end encrypted.
export async function recordSecretHistory(entry: {
  secretId: string
  envId: string
  key: string
  encryptedValue: string
  changeType: HistoryChangeType
  changedBy: string
}): Promise<void> {
  await db.insert(secretHistory).values({
    id: generateId(),
    secret_id: entry.secretId,
    env_id: entry.envId,
    key: entry.key,
    encrypted_value: entry.encryptedValue,
    change_type: entry.changeType,
    changed_by: entry.changedBy,
  })
}

// Snapshots the previous value of a plain env var. Live var values are
// plaintext by design, but history rows are encrypted at rest under the
// server secret so retained copies never sit in the clear.
export async function recordVarHistory(entry: {
  varId: string
  envId: string
  key: string
  value: string
  changeType: HistoryChangeType
  changedBy: string
}): Promise<void> {
  const serverKey = await getServerSecretKey()
  await db.insert(envVarHistory).values({
    id: generateId(),
    var_id: entry.varId,
    env_id: entry.envId,
    key: entry.key,
    encrypted_value: await encrypt(serverKey, entry.value),
    change_type: entry.changeType,
    changed_by: entry.changedBy,
  })
}
