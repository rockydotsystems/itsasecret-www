import { Avatar } from './avatar'
import { LogoMark } from './logo'
import { performLogout } from '~/lib/auth-form'
import { IconCircleLogout, IconRocket, IconUser } from 'nucleo-pixel-essential'

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
          <a href="/how-it-works">How it works</a>
          <a href="/pricing">Pricing</a>
        </div>
        <div className="navbar-actions">
          {loggedIn ? (
            <>
              <a href="/dashboard" className="navbar-user" title={userEmail}>
                <Avatar name={userEmail} email={userEmail} size="sm" />
                <span className="navbar-user-email">{userEmail}</span>
              </a>
              <button
                type="button"
                className="btn btn-danger btn-sm btn-icon"
                aria-label="Log out"
                title="Log out"
                onClick={() => void performLogout()}
              >
                <IconCircleLogout size={16} aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <a href="/login" className="btn btn-ghost btn-sm">
                <IconUser size={16} aria-hidden="true" />
                Log in
              </a>
              <a href="/register" className="btn btn-primary btn-sm">
                Get started
                <IconRocket size={16} aria-hidden="true" />
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
