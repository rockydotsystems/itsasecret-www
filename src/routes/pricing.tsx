import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '~/components/button'
import { Navbar } from '~/components/navbar'
import { RedactionTexture } from '~/components/redactiontexture'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'
import { IconHouse2, IconRocket } from 'nucleo-pixel-essential'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
})

const INCLUDED = [
  'Unlimited secrets & env vars',
  'Unlimited environments - production, staging, per-dev forks',
  'Your whole team, roles included',
  'End-to-end encryption on every plan, forever',
  'CLI + web dashboard',
  'Version history & recovery',
]

function PricingPage() {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    void getCurrentUser().then((u) => {
      setUser(u)
    })
  }, [])

  return (
    <>
      <Navbar loggedIn={!!user} userEmail={user?.email} />

      <section className="hero hero-texture">
        <RedactionTexture rows={18} />
        <div className="hero-inner">
          <h1 className="hero-title">
            Free while in beta<span className="hero-title-flare">.</span>
          </h1>
          <p className="hero-subtitle">
            Every feature, every environment, your whole team. Paid team plans arrive with GA -
            early users hear about it first, with plenty of notice.
          </p>

          <div className="pricing-card">
            <div className="pricing-card-header">
              <span className="pricing-card-name">Beta</span>
              <span className="pricing-card-price">
                $0<span className="pricing-card-period">/ month</span>
              </span>
            </div>
            <ul className="pricing-includes">
              {INCLUDED.map((item) => (
                <li key={item}>
                  <span className="term-ok">✓</span> {item}
                </li>
              ))}
            </ul>
            <div className="pricing-card-cta">
              {user ? (
                <Button variant="primary" size="lg" href="/dashboard">
                  <IconHouse2 size={16} aria-hidden="true" />
                  Go to dashboard
                </Button>
              ) : (
                <Button variant="primary" size="lg" href="/register">
                  Get started
                  <IconRocket size={16} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>

          <p className="pricing-footnote">
            Questions about team plans or self-hosting? The crypto is the same on every tier -
            encryption is never a paid feature.
          </p>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>itsasecret.dev &middot; shh secret set. shh pull. done.</span>
          <span className="site-footer-links">
            <a href="/docs">docs</a>
            <a href="/how-it-works">how it works</a>
            <a href="/login">log in</a>
            <a href="/register">register</a>
          </span>
        </div>
      </footer>
    </>
  )
}
