import { createFileRoute } from '@tanstack/react-router'
import { presignGetUrl } from '~/lib/s3-presign'

// CLI binary downloads. The Railway bucket is private, so this route
// presigns a short-lived GET and redirects — install.sh and direct curls
// only ever see itsasecret.dev URLs.
const ALLOWED_TARGETS =
  /^(itsasecret_(linux|darwin)_(amd64|arm64)|checksums\.txt|version\.json)$/

export const Route = createFileRoute('/api/dl/$target')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const target = params.target!
        if (!ALLOWED_TARGETS.test(target)) {
          return Response.json({ error: 'Unknown download' }, { status: 404 })
        }

        const endpoint = process.env.BUCKET_ENDPOINT
        const bucket = process.env.BUCKET_NAME
        const accessKeyId = process.env.BUCKET_ACCESS_KEY_ID
        const secretAccessKey = process.env.BUCKET_SECRET_ACCESS_KEY
        if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
          return Response.json(
            { error: 'Downloads are not configured on this server' },
            { status: 503 },
          )
        }

        const url = presignGetUrl({
          endpoint,
          bucket,
          region: process.env.BUCKET_REGION ?? 'auto',
          accessKeyId,
          secretAccessKey,
          key: `cli/latest/${target}`,
          expiresSeconds: 300,
        })
        return new Response(null, {
          status: 302,
          headers: { Location: url, 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
