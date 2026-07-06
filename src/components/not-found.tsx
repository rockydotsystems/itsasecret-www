import { Button } from './button'
import { IconHouse2, IconUser } from 'nucleo-pixel-essential'

export function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <h1 className="not-found-code">404</h1>
        <p className="not-found-title">This page is a secret.</p>
        <p className="not-found-body">
          We couldn't find what you were looking for - it may have been moved, deleted, or never existed.
        </p>
        <div className="not-found-actions">
          <Button variant="primary" size="lg" href="/">
            <IconHouse2 size={16} aria-hidden="true" />
            Go home
          </Button>
          <Button variant="secondary" size="lg" href="/login">
            <IconUser size={16} aria-hidden="true" />
            Log in
          </Button>
        </div>
      </div>
    </div>
  )
}
