import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '~/components/button'
import { Navbar } from '~/components/navbar'
import { SiteFooter } from '~/components/sitefooter'
import { RedactionTexture } from '~/components/redactiontexture'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'
import { IconRocket } from 'nucleo-pixel-essential'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
})

type Tier = {
  name: string
  price: string
  period?: string
  blurb: string
  features: string[]
  note?: string
  cta: string
  featured?: boolean
  // Which link the CTA points at, depending on auth state.
  ctaIn?: string
  ctaOut?: string
  disabled?: boolean
}

const TIERS: Tier[] = [
  {
    name: 'Personal',
    price: '$0',
    period: '/ month',
    blurb: 'For a single developer.',
    features: [
      'Up to 20 projects',
      'Unlimited secrets, env vars & environments',
      'End-to-end encryption, always',
      'Single user - no team collaboration',
    ],
    cta: 'Get started',
    ctaIn: '/dashboard',
    ctaOut: '/register',
  },
  {
    name: 'Team',
    price: '$13.79',
    period: '/ developer / month',
    blurb: 'For teams of any size.',
    features: [
      'Up to 50 projects',
      'Unlimited secrets, env vars & environments',
      'Team collaboration - roles & approvals',
      'Everything in Personal',
    ],
    note: 'Includes 1 free super-user to act as the team head - an admin plus 2 developers counts as just 2 seats.',
    cta: 'Start a team',
    ctaIn: '/dashboard',
    ctaOut: '/register',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: "Let's talk",
    blurb: 'For organizations with bespoke needs.',
    features: [
      'Managed hosting',
      'Priority customer support',
      'Bring your own custom servers',
      'Everything in Team',
    ],
    cta: 'Contact us',
    ctaIn: 'mailto:enterprise@itsasecret.dev',
    ctaOut: 'mailto:enterprise@itsasecret.dev',
  },
  {
    name: 'Self-host',
    price: 'Coming soon',
    blurb: 'Run itsasecret on your own infrastructure.',
    features: ['Your servers, your data', 'Full control of the stack'],
    cta: 'Docs coming soon',
    disabled: true,
  },
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
            Pricing<span className="hero-title-flare">.</span>
          </h1>
          <p className="hero-subtitle">
            Free for personal use, forever. Paid when you bring a team - per developer, with
            end-to-end encryption on every plan.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="pricing-tiers">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`pricing-tier${tier.featured ? ' pricing-tier--featured' : ''}`}
            >
              <span className="pricing-tier-name">{tier.name}</span>
              <span className="pricing-tier-price">
                {tier.price}
                {tier.period ? <span className="pricing-tier-period">{tier.period}</span> : null}
              </span>
              <p className="pricing-tier-blurb">{tier.blurb}</p>
              <ul className="pricing-tier-features">
                {tier.features.map((f) => (
                  <li key={f}>
                    <span className="term-ok">✓</span> {f}
                  </li>
                ))}
              </ul>
              {tier.note ? <p className="pricing-tier-note">{tier.note}</p> : null}
              <div className="pricing-tier-cta">
                {tier.disabled || !tier.ctaIn ? (
                  <Button variant="secondary" disabled>
                    {tier.cta}
                  </Button>
                ) : (
                  <Button
                    variant={tier.featured ? 'primary' : 'secondary'}
                    href={user ? tier.ctaIn : (tier.ctaOut ?? tier.ctaIn)}
                  >
                    {tier.cta}
                    {tier.featured && <IconRocket size={16} aria-hidden="true" />}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="pricing-footnote">
          Team upgrades happen from Organization settings → Billing in the dashboard. Seats are
          billed per developer - the first seat (your team head) is on us.
        </p>
        <p className="pricing-footnote">
          <a href="/how-it-works">How the encryption works</a> · {user ? <a href="/dashboard">Open the dashboard</a> : <a href="/register">Create an account</a>}
        </p>
      </section>

      <SiteFooter />
    </>
  )
}
