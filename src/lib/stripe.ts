// Hand-rolled Stripe REST client - no SDK, same discipline as s3-presign.ts.
// Only the handful of calls billing needs: customers, checkout sessions,
// billing-portal sessions, and subscription reads/updates. Webhook signature
// verification is HMAC-SHA256 over "<timestamp>.<raw body>" per
// https://docs.stripe.com/webhooks/signature
//
// Env: STRIPE_SECRET_KEY (sk_...), STRIPE_TEAM_PRICE_ID (price_... monthly
// per-seat Team price), STRIPE_WEBHOOK_SECRET (whsec_...). When the secret
// key is unset (local dev without Stripe) isBillingEnabled() is false and
// every checkout/portal route 503s; the webhook route 503s without the
// webhook secret. Plan limits are DB-side and stay enforced either way.

const STRIPE_API_BASE = 'https://api.stripe.com'

export function isBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_TEAM_PRICE_ID)
}

export function teamPriceId(): string {
  const id = process.env.STRIPE_TEAM_PRICE_ID
  if (!id) throw new Error('STRIPE_TEAM_PRICE_ID is not set')
  return id
}

export class StripeApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

interface StripeErrorBody {
  error?: { message?: string }
}

async function stripeRequest<T>(method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set')

  const res = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])) : undefined,
  })

  const body = (await res.json().catch(() => ({}))) as StripeErrorBody & T
  if (!res.ok) {
    const message = body.error?.message ?? `Stripe ${method} ${path} failed (${res.status})`
    console.error(`[stripe] ${method} ${path} -> ${res.status}: ${message}`)
    throw new StripeApiError(message, res.status)
  }
  return body
}

// Minimal shapes for the fields itsasecret reads. Stripe responses carry far
// more; anything not listed is ignored.
export interface StripeCustomer {
  id: string
}

export interface StripeCheckoutSession {
  id: string
  url: string | null
  mode: string
  customer: string | null
  subscription: string | null
  metadata?: Record<string, string>
}

export interface StripeSubscriptionItem {
  id: string
  quantity?: number
  current_period_end?: number
  price?: { id?: string }
}

export interface StripeSubscription {
  id: string
  customer: string
  status: string
  cancel_at_period_end?: boolean
  // Present pre-2025-04 API versions; newer versions put it on the item.
  current_period_end?: number
  items?: { data?: StripeSubscriptionItem[] }
  metadata?: Record<string, string>
}

export interface StripePortalSession {
  id: string
  url: string
}

export async function createCustomer(orgId: string, orgName: string, email: string): Promise<StripeCustomer> {
  return stripeRequest<StripeCustomer>('POST', '/v1/customers', {
    email,
    name: orgName,
    'metadata[org_id]': orgId,
  })
}

export async function createTeamCheckoutSession(args: {
  customerId: string
  orgId: string
  seats: number
  successUrl: string
  cancelUrl: string
}): Promise<StripeCheckoutSession> {
  return stripeRequest<StripeCheckoutSession>('POST', '/v1/checkout/sessions', {
    mode: 'subscription',
    customer: args.customerId,
    'line_items[0][price]': teamPriceId(),
    'line_items[0][quantity]': args.seats,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    'metadata[org_id]': args.orgId,
    'subscription_data[metadata][org_id]': args.orgId,
  })
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>('POST', '/v1/billing_portal/sessions', {
    customer: customerId,
    return_url: returnUrl,
  })
}

export async function getSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>('GET', `/v1/subscriptions/${subscriptionId}`)
}

// Cancels immediately. Used when an org is deleted - a soft-deleted org must
// not keep charging its owner.
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  await stripeRequest<unknown>('DELETE', `/v1/subscriptions/${subscriptionId}`)
}

// Changing the seat count invoices the proration immediately so the org is
// never riding on seats it hasn't paid for yet.
export async function updateSubscriptionQuantity(subscriptionId: string, itemId: string, quantity: number): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>('POST', `/v1/subscriptions/${subscriptionId}`, {
    'items[0][id]': itemId,
    'items[0][quantity]': quantity,
    proration_behavior: 'always_invoice',
  })
}

// Seat count + period end live on the (single) line item on newer API
// versions, and at the top level on older ones - read both.
export function subscriptionSeats(sub: StripeSubscription): number {
  const qty = sub.items?.data?.[0]?.quantity
  return typeof qty === 'number' && qty > 0 ? qty : 1
}

export function subscriptionPeriodEnd(sub: StripeSubscription): Date | null {
  const epoch = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end
  return typeof epoch === 'number' ? new Date(epoch * 1000) : null
}

const WEBHOOK_TOLERANCE_SECONDS = 300

// constant-time-ish string compare; signatures are HMAC digests, not user
// passwords, so a byte-at-a-time loop is plenty.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function computeWebhookSignature(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`))
  return bytesToHex(new Uint8Array(mac))
}

// Verifies the Stripe-Signature header against the exact raw request body.
// Raw body matters: re-serialized JSON changes the bytes and fails the MAC.
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!signatureHeader) return false

  let timestamp: string | null = null
  const signatures: string[] = []
  for (const part of signatureHeader.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') timestamp = value
    else if (key === 'v1') signatures.push(value)
  }
  if (!timestamp || signatures.length === 0) return false

  // Reject stale events outright - a replayed header must not verify.
  const ts = Number.parseInt(timestamp, 10)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > WEBHOOK_TOLERANCE_SECONDS) return false

  const expected = await computeWebhookSignature(secret, timestamp, rawBody)
  return signatures.some((sig) => safeEqual(sig, expected))
}
