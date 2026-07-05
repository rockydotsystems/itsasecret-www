import { createFileRoute } from '@tanstack/react-router'
import installScript from '~/assets/install.sh?raw'

// The copy-pasteable installer: curl -fsSL https://itsasecret.dev/install.sh | sh
// Served as a route (not a static asset) so it gets an explicit content type
// and works the same in dev and the nitro build.
export const Route = createFileRoute('/install.sh')({
  server: {
    handlers: {
      GET: async () =>
        new Response(installScript, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        }),
    },
  },
})
