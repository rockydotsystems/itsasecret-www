import { createServerFn } from '@tanstack/react-start'
import { presignGetUrl } from '~/lib/s3-presign'

export type ChecksumEntry = { file: string; hash: string }

// The docs page shows the release binaries' sha256 sums. They change on every
// push to main, so read them live from the bucket's checksums.txt rather than
// baking stale values into the page. A short in-memory cache keeps repeated
// docs hits from presigning + fetching on every render (Railway runs a single
// long-lived replica, so the module scope persists); 60s keeps the list within
// a minute of a fresh release while sparing the bucket a hit per page view.
const TTL_MS = 60 * 1000
let cache: { at: number; entries: ChecksumEntry[] } | null = null

function parseChecksums(text: string): ChecksumEntry[] {
  // Lines are `sha256sum` output: `<hash>  <file>`.
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, file] = line.split(/\s+/)
      return { hash, file }
    })
    .filter((e): e is ChecksumEntry => Boolean(e.hash && e.file))
}

// Returns null when downloads aren't configured (local dev) or the fetch
// fails - the page then falls back to a link. Only successful reads are
// cached, so a transient failure retries on the next request.
export const getChecksumsFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ChecksumEntry[] | null> => {
    if (cache && Date.now() - cache.at < TTL_MS) return cache.entries

    const endpoint = process.env.BUCKET_ENDPOINT
    const bucket = process.env.BUCKET_NAME
    const accessKeyId = process.env.BUCKET_ACCESS_KEY_ID
    const secretAccessKey = process.env.BUCKET_SECRET_ACCESS_KEY
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null

    try {
      const url = presignGetUrl({
        endpoint,
        bucket,
        region: process.env.BUCKET_REGION ?? 'auto',
        accessKeyId,
        secretAccessKey,
        key: 'cli/latest/checksums.txt',
        expiresSeconds: 300,
      })
      const res = await fetch(url)
      if (!res.ok) return null
      const entries = parseChecksums(await res.text())
      if (!entries.length) return null
      cache = { at: Date.now(), entries }
      return entries
    } catch {
      return null
    }
  },
)
