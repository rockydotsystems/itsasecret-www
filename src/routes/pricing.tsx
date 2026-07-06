import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Button } from '~/components/button'
import { Navbar } from '~/components/navbar'
import { SiteFooter } from '~/components/sitefooter'
import { RedactionTexture } from '~/components/redactiontexture'
import { getCurrentUser, type CurrentUser } from '~/lib/auth-form'

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
  email?: string
  cta: string
  featured?: boolean
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
    email: 'enterprise@itsasecret.dev',
    cta: 'Contact us',
  },
  {
    name: 'Self-host',
    price: 'Coming soon',
    blurb: 'Run itsasecret on your own infrastructure.',
    features: ['Your servers, your data', 'Full control of the stack'],
    cta: 'Docs coming soon',
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
            Simple, honest pricing<span className="hero-title-flare">.</span>
          </h1>
          <p className="hero-subtitle">
            Encryption is never a paid feature - the crypto is identical on every tier. These plans
            are not live yet; today, everything is free while in beta.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="pricing-preview">
          <span className="pricing-preview-flag">Pricing preview - coming soon</span>
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
                {tier.email ? <p className="pricing-tier-email">{tier.email}</p> : null}
                <div className="pricing-tier-cta">
                  <Button variant={tier.featured ? 'primary' : 'secondary'} disabled>
                    {tier.cta}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="pricing-footnote">
          Prices aren&rsquo;t final and these tiers can&rsquo;t be selected yet - they&rsquo;re here
          so you know where things are headed. Early users hear about GA first, with plenty of
          notice.
        </p>
      </section>

      <SiteFooter />
    </>
  )
}
