import { base64Encode } from './crypto/base64'

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
  const kp = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  )
  const rawPub = await crypto.subtle.exportKey('raw', kp.publicKey)
  const clientPubkey = base64Encode(new Uint8Array(rawPub))

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, clientPubkey }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(err.error || 'Something went wrong')
  }

  const data = (await resp.json()) as AuthFormResult

  const rawPriv = await crypto.subtle.exportKey('pkcs8', kp.privateKey)
  localStorage.setItem('ecdhPrivKey', base64Encode(new Uint8Array(rawPriv)))
  localStorage.setItem('sessionToken', data.token)
  localStorage.setItem('serverPubkey', data.serverPubkey)
  localStorage.setItem('orgKeys', JSON.stringify(data.orgKeys))

  return data
}

export function getRedirectPath(redirect: string | undefined, origin?: string): string {
  if (!redirect) return '/dashboard'
  try {
    const url = new URL(redirect)
    if (origin && url.origin !== origin) return '/dashboard'
    return url.pathname + url.search + url.hash
  } catch {
    return redirect.startsWith('/') ? redirect : '/dashboard'
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

export async function performLogout(): Promise<void> {
  const token = localStorage.getItem('sessionToken')
  if (token) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // Ignore network errors; still clear local storage and redirect
    }
  }
  localStorage.removeItem('ecdhPrivKey')
  localStorage.removeItem('sessionToken')
  localStorage.removeItem('serverPubkey')
  localStorage.removeItem('orgKeys')
  window.location.href = '/login'
}

export interface CurrentUser {
  id: string
  email: string
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (typeof localStorage === 'undefined') return null
  const token = localStorage.getItem('sessionToken')
  if (!token) return null
  try {
    const resp = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
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
