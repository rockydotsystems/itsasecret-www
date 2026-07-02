import { createRoute } from '@hono/zod-openapi';
import { z } from 'zod';

const responseSchema = z.object({
  status: z.literal('ok'),
});

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  responses: {
    200: {
      content: { 'application/json': { schema: responseSchema } },
      description: 'Service health',
    },
  },
});
