import { LogoMark } from './logo';

export type NavbarProps = {
  loggedIn?: boolean;
};

export const Navbar = ({ loggedIn = false }: NavbarProps) => (
  <nav class="navbar">
    <div class="navbar-inner">
      <a href="/" class="navbar-brand">
        <LogoMark size={24} />
        <span>itsasecret</span>
      </a>
      <div class="navbar-links">
        <a href="/docs">Docs</a>
        <a href="/pricing">Pricing</a>
      </div>
      <div class="navbar-actions">
        {loggedIn ? (
          <a href="/dashboard" class="btn btn-primary btn-sm">Dashboard</a>
        ) : (
          <>
            <a href="/login" class="btn btn-ghost btn-sm">Log in</a>
            <a href="/register" class="btn btn-primary btn-sm">Get started</a>
          </>
        )}
      </div>
    </div>
  </nav>
);
