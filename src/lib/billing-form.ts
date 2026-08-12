// Client calls for the billing API. Auth rides the HttpOnly session cookie -
// same pattern as org-settings-form.ts.

import type { BillingView } from './plans'

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
}

async function throwResponseError(resp: Response, fallback: string): Promise<never> {
  const err = await resp.json().catch(() => ({ error: fallback }))
  throw new Error(err.error || fallback)
}

export type { BillingView }

export async function startCheckout(orgId: string): Promise<string> {
  const resp = await fetch(`/api/orgs/${orgId}/billing/checkout`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to start checkout')
  const { url } = (await resp.json()) as { url: string }
  return url
}

export async function openBillingPortal(orgId: string): Promise<string> {
  const resp = await fetch(`/api/orgs/${orgId}/billing/portal`, {
    method: 'POST',
    headers: authHeaders(),
  })
  if (!resp.ok) await throwResponseError(resp, 'Failed to open the billing portal')
  const { url } = (await resp.json()) as { url: string }
  return url
}
