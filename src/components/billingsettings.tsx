import { useState } from 'react'
import { Badge } from '~/components/badge'
import { Button } from '~/components/button'
import { LoadingDots } from '~/components/loadingdots'
import { startCheckout, openBillingPortal } from '~/lib/billing-form'
import { TEAM_SEAT_MONTHLY_USD } from '~/lib/plans-shared'
import type { BillingView } from '~/lib/plans'
import { IconCreditCard, IconRocket } from 'nucleo-pixel-essential'

export type BillingSectionProps = {
  orgId: string
  orgKind: string
  billing: BillingView
  canManage: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Plan + subscription state for the org. Reads are DB-backed (the settings
// page never blocks on Stripe); changes open Stripe's hosted checkout/portal
// and come back through webhooks.
export function BillingSection({ orgId, orgKind, billing, canManage }: BillingSectionProps) {
  const [busy, setBusy] = useState<'checkout' | 'portal' | ''>('')
  const [error, setError] = useState('')

  const isPersonal = orgKind === 'personal'
  const isTeam = billing.plan === 'team'
  const sub = billing.subscription

  async function go(kind: 'checkout' | 'portal') {
    setBusy(kind)
    setError('')
    try {
      const url = kind === 'checkout' ? await startCheckout(orgId) : await openBillingPortal(orgId)
      window.location.href = url
    } catch (err) {
      setError((err as Error).message || 'Something went wrong')
      setBusy('')
    }
  }

  return (
    <section className="card settings-section">
      <div className="settings-section-header">
        <div>
          <h2 className="settings-section-title">Billing</h2>
          <p className="settings-section-desc">
            {isTeam
              ? 'This organization is on the Team plan.'
              : isPersonal
                ? 'Personal organizations are free for solo use. To collaborate, create a shared organization and upgrade it to Team.'
                : 'This organization is on the free plan. Upgrade to Team to invite members and create teams.'}
          </p>
        </div>
        <Badge variant={isTeam ? 'signal' : 'neutral'}>{isTeam ? 'team' : isPersonal ? 'personal' : 'free'}</Badge>
      </div>

      <div className="billing-summary">
        <div className="billing-summary-row">
          <span className="input-label">Projects</span>
          <span className="billing-summary-value">{billing.projectCount} / {billing.maxProjects}</span>
        </div>
        <div className="billing-summary-row">
          <span className="input-label">Members</span>
          <span className="billing-summary-value">
            {billing.memberCount}
            {isTeam ? ` (${billing.billableSeats} billable ${billing.billableSeats === 1 ? 'seat' : 'seats'})` : ''}
          </span>
        </div>
        {sub && (
          <div className="billing-summary-row">
            <span className="input-label">Subscription</span>
            <span className="billing-summary-value">
              {sub.cancelAtPeriodEnd && sub.currentPeriodEnd
                ? `cancels ${formatDate(sub.currentPeriodEnd)}`
                : sub.currentPeriodEnd
                  ? `renews ${formatDate(sub.currentPeriodEnd)}`
                  : sub.status}
              {sub.status === 'past_due' && <Badge variant="warning">past due</Badge>}
            </span>
          </div>
        )}
      </div>

      {sub?.status === 'past_due' && (
        <span className="input-error">
          The last payment failed. Update the payment method in the billing portal to keep the Team plan.
        </span>
      )}

      {canManage && (
        <div className="settings-form-actions">
          {!isTeam && !isPersonal && billing.billingEnabled && (
            <Button size="sm" onClick={() => void go('checkout')} disabled={busy !== ''}>
              {busy === 'checkout' ? <LoadingDots /> : (
                <>
                  <IconRocket size={16} aria-hidden="true" />
                  Upgrade to Team - ${TEAM_SEAT_MONTHLY_USD}/dev/mo
                </>
              )}
            </Button>
          )}
          {billing.subscription && billing.billingEnabled && (
            <Button size="sm" variant="secondary" onClick={() => void go('portal')} disabled={busy !== ''}>
              {busy === 'portal' ? <LoadingDots /> : (
                <>
                  <IconCreditCard size={16} aria-hidden="true" />
                  Manage billing
                </>
              )}
            </Button>
          )}
          {!billing.billingEnabled && (
            <span className="input-helper">Billing isn&rsquo;t configured on this server yet, so everything stays on the free plan.</span>
          )}
        </div>
      )}
      {error && <span className="input-error">{error}</span>}
    </section>
  )
}
