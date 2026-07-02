import { app } from './app';
import type { Bindings } from './bindings';

export default {
  async fetch(req: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(req, env, ctx);
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Bindings,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(purgeExpired(env));
  },
};

async function purgeExpired(env: Bindings): Promise<void> {
  if (!env.DB) return;
  const cutoff = 90 * 24 * 60 * 60;
  const tables = ['env_vars', 'secrets', 'environments', 'projects'];
  for (const table of tables) {
    await env.DB.prepare(
      `DELETE FROM ${table} WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', '-${cutoff} seconds')`
    ).run();
  }
}
