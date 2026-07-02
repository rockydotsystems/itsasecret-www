import { LogoMark } from './logo'

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
              <span className="navbar-user" title={userEmail}>{userEmail}</span>
              <a href="/dashboard" className="btn btn-primary btn-sm">Dashboard</a>
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
