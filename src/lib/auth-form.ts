import { base64Encode } from './crypto/base64'
import { lockVault, seedVaultFromLogin } from './vault'
import { storeClientPrivateKey, clearClientPrivateKey } from './client-session'

export interface AuthFormResult {
  token: string
  serverPubkey: string
  orgKeys: Record<string, string>
}

export async function submitAuthForm(
  endpoint: '/api/auth/register' | '/api/auth/login',
  email: string,
  password: string
): Promise<AuthFormResult> {
  // Private key is non-extractable: usable for ECDH derivation but its bytes can
  // never be read back out, so it can't be lifted from storage by an XSS.
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  )
  const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey)
  const clientPubkey = base64Encode(new Uint8Array(rawPub))

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify({ email, password, clientPubkey }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Something went wrong')
  }

  const data = (await resp.json()) as AuthFormResult

  // The bearer token is carried only by the HttpOnly session_token cookie
  // (Set-Cookie on this response) - it is deliberately never written to
  // localStorage, where any XSS could read it. The server public key is not
  // secret; the ECDH private key is stored non-extractable in IndexedDB.
  localStorage.setItem('serverPubkey', data.serverPubkey)
  await storeClientPrivateKey(kp.privateKey)

  try {
    // The master password is in hand: derive and cache the master key now so
    // the dashboard doesn't have to re-prompt for it in this tab.
    await seedVaultFromLogin(password)
  } catch {
    // Best-effort - the dashboard prompts for the master password when needed.
  }

  return data
}

export function getRedirectPath(redirect: string | undefined, origin?: string): string {
  if (!redirect) return '/dashboard'
  try {
    const url = new URL(redirect)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '/dashboard'
    if (origin && url.origin !== origin) return '/dashboard'
    return url.pathname + url.search + url.hash
  } catch {
    // Relative path only. Reject protocol-relative ("//evil.com") and the
    // backslash variant ("/\evil.com") - browsers treat both as absolute
    // cross-origin URLs, so `?redirect=//evil.com` would be an open redirect.
    if (redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.startsWith('/\\')) {
      return redirect
    }
    return '/dashboard'
  }
}

export function storeAuthFormNativeListener(
  formId: string,
  endpoint: '/api/auth/register' | '/api/auth/login',
  fallbackUrl: string
): void {
  if (typeof document === 'undefined') return
  const form = document.getElementById(formId)
  if (!form || !(form instanceof HTMLFormElement)) return

  form.addEventListener('submit', (e) => {
    // Once React hydrates it owns the form; this direct listener fires before
    // React's delegated handler, so defaultPrevented alone can't detect that.
    if (form.dataset.reactManaged === 'true') return
    if (e.defaultPrevented) return
    e.preventDefault()

    const emailEl = form.elements.namedItem('email') as HTMLInputElement | null
    const passwordEl = form.elements.namedItem('password') as HTMLInputElement | null
    if (!emailEl || !passwordEl) return

    const email = emailEl.value
    const password = passwordEl.value
    if (!email || !password) return

    const params = new URLSearchParams(window.location.search)
    const redirect = params.get('redirect') || fallbackUrl
    const redirectTo = getRedirectPath(redirect)

    submitAuthForm(endpoint, email, password)
      .then(() => {
        window.location.href = redirectTo
      })
      .catch((err) => {
        const errorEl = form.querySelector('[data-auth-form-error]') as HTMLElement | null
        if (errorEl) errorEl.textContent = 'Error: ' + (err.message || 'unknown')
      })
  })
}

export async function performLogout(redirectTo = '/login'): Promise<void> {
  try {
    // The HttpOnly cookie authenticates this request and is cleared by the
    // response's Set-Cookie.
    await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } })
  } catch {
    // Ignore network errors; still clear local state and redirect.
  }
  localStorage.removeItem('serverPubkey')
  // Clean up any credentials left by older builds that used localStorage.
  localStorage.removeItem('ecdhPrivKey')
  localStorage.removeItem('sessionToken')
  localStorage.removeItem('orgKeys')
  await clearClientPrivateKey().catch(() => {})
  lockVault()
  window.location.href = redirectTo
}

export interface CurrentUser {
  id: string
  email: string
  name: string | null
  kdf_salt: string
  kdf_params: string
  email_verified: boolean
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (typeof window === 'undefined') return null
  try {
    // Authenticated by the HttpOnly session_token cookie, sent automatically on
    // this same-origin request.
    const resp = await fetch('/api/auth/me')
    if (!resp.ok) return null
    const data = (await resp.json()) as { user: CurrentUser }
    return data.user
  } catch {
    return null
  }
}

export function attachLogoutButtonNativeListener(buttonId: string): void {
  if (typeof document === 'undefined') return
  const button = document.getElementById(buttonId)
  if (!button || !(button instanceof HTMLButtonElement)) return

  button.addEventListener('click', () => {
    void performLogout()
  })
}

// Global function for inline script fallback
if (typeof window !== 'undefined') {
  ;(window as any).__registerAuthFormNative = storeAuthFormNativeListener
  ;(window as any).__attachLogoutButtonNative = attachLogoutButtonNativeListener
}
