import { Avatar } from './avatar'
import { LogoMark } from './logo'
import { performLogout } from '~/lib/auth-form'

export type NavbarProps = {
  loggedIn?: boolean
  userEmail?: string
}

export function Navbar({ loggedIn = false, userEmail }: NavbarProps) {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <a href="/" className="navbar-brand">
          <LogoMark size={24} />
          <span>itsasecret</span>
        </a>
        <div className="navbar-links">
          <a href="/docs">Docs</a>
          <a href="/pricing">Pricing</a>
        </div>
        <div className="navbar-actions">
          {loggedIn ? (
            <>
              <a href="/dashboard" className="navbar-user" title={userEmail}>
                <Avatar name={userEmail} size="sm" />
                <span className="navbar-user-email">{userEmail}</span>
              </a>
              <button
                type="button"
                className="btn btn-danger btn-sm btn-icon"
                aria-label="Log out"
                title="Log out"
                onClick={() => void performLogout()}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="btn btn-ghost btn-sm">Log in</a>
              <a href="/register" className="btn btn-primary btn-sm">Get started</a>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
