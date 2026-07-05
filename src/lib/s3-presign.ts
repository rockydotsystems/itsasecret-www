import { createHash, createHmac } from 'node:crypto'

// Minimal SigV4 query presigner for GET requests against an S3-compatible
// store (Railway Buckets). Query-string auth only — no request body, no
// extra signed headers — so the ~60 lines here beat pulling in the AWS SDK.

interface PresignOptions {
  endpoint: string // base S3 endpoint, e.g. https://storage.railway.app
  bucket: string
  region: string // Railway buckets use 'auto'
  accessKeyId: string
  secretAccessKey: string
  key: string // object key, e.g. cli/latest/itsasecret_linux_amd64
  expiresSeconds: number
  now?: Date // injectable for tests
}

// RFC 3986 encoding as SigV4 requires (encodeURIComponent plus the
// characters it leaves bare).
function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

export function presignGetUrl(opts: PresignOptions): string {
  // Virtual-hosted style: the bucket is a subdomain of the endpoint.
  const host = `${opts.bucket}.${new URL(opts.endpoint).host}`
  const path = '/' + opts.key.split('/').map(rfc3986).join('/')

  const now = opts.now ?? new Date()
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/${opts.region}/s3/aws4_request`

  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${opts.accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(opts.expiresSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ]
    .map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`)
    .sort()
    .join('&')

  const canonicalRequest = [
    'GET',
    path,
    query,
    `host:${host}`,
    '',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${opts.secretAccessKey}`, dateStamp), opts.region), 's3'),
    'aws4_request',
  )
  const signature = hmac(signingKey, stringToSign).toString('hex')

  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`
}
