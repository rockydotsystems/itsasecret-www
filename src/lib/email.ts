// Transactional email via Resend (https://resend.com/docs/api-reference).
//
// When RESEND_API_KEY is unset (local dev / tests) we skip the network call and
// print the verification link to the server terminal so accounts can be
// verified without a Resend account.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'itsasecret <onboarding@resend.dev>'

export interface SendVerificationEmailArgs {
  to: string
  verifyUrl: string
}

export async function sendVerificationEmail({ to, verifyUrl }: SendVerificationEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    // No Resend key: surface the link on the terminal for manual verification.
    console.log(
      `\n[email:dev] Verify ${to} - no RESEND_API_KEY set, open this link to verify:\n  ${verifyUrl}\n`
    )
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to,
      subject: 'Verify your itsasecret email',
      html: verificationEmailHtml(verifyUrl),
      text: `Verify your itsasecret email address by opening this link:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
    }),
  })

  if (!res.ok) {
    // Don't fail signup on a delivery hiccup; log for observability and let the
    // user re-request verification later.
    const detail = await res.text().catch(() => '')
    console.error(`[email] Resend send failed (${res.status}): ${detail}`)
  }
}

export interface SendOrgInviteEmailArgs {
  to: string
  orgName: string
  inviterEmail: string
  role: string
  acceptUrl: string
}

// Emails an org invitation with its single-use accept link. Best-effort like
// verification: a delivery hiccup must not fail the invite - the inviter can
// re-invite the same email to resend a fresh link.
export async function sendOrgInviteEmail({ to, orgName, inviterEmail, role, acceptUrl }: SendOrgInviteEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(
      `\n[email:dev] Invite ${to} to "${orgName}" (${role}) - no RESEND_API_KEY set, open this link to accept:\n  ${acceptUrl}\n`
    )
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to,
      reply_to: inviterEmail,
      subject: `${inviterEmail} invited you to ${orgName} on itsasecret`,
      html: orgInviteEmailHtml({ orgName, inviterEmail, role, acceptUrl }),
      text: `${inviterEmail} invited you to join the organization "${orgName}" on itsasecret as ${role === 'admin' ? 'an admin' : 'a member'}.\n\nAccept the invitation by opening this link:\n\n${acceptUrl}\n\nThis link expires in 7 days. If you weren't expecting this, ignore this email.`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`[email] Resend invite send failed (${res.status}): ${detail}`)
  }
}

export interface SendTeamAddedEmailArgs {
  to: string
  teamName: string
  orgName: string
  addedByEmail: string
  dashboardUrl: string
}

// Notifies an org member they were added to a team. Pure notification - there
// is nothing to accept - so a delivery failure is logged and swallowed.
export async function sendTeamAddedEmail({ to, teamName, orgName, addedByEmail, dashboardUrl }: SendTeamAddedEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(
      `\n[email:dev] ${to} added to team "${teamName}" in "${orgName}" by ${addedByEmail} - no RESEND_API_KEY set, skipping notification email\n`
    )
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to,
      reply_to: addedByEmail,
      subject: `You've been added to ${teamName} in ${orgName} on itsasecret`,
      html: teamAddedEmailHtml({ teamName, orgName, addedByEmail, dashboardUrl }),
      text: `${addedByEmail} added you to the team "${teamName}" in the organization "${orgName}" on itsasecret.\n\nYou now have whatever project and environment access is granted to ${teamName}.\n\n${dashboardUrl}`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`[email] Resend team-added send failed (${res.status}): ${detail}`)
  }
}

export interface SendTeamRemovedEmailArgs {
  to: string
  teamName: string
  orgName: string
  removedByEmail: string
}

// Notifies an org member they were removed from a team. Same contract as the
// added notification: pure heads-up, failures logged and swallowed.
export async function sendTeamRemovedEmail({ to, teamName, orgName, removedByEmail }: SendTeamRemovedEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.log(
      `\n[email:dev] ${to} removed from team "${teamName}" in "${orgName}" by ${removedByEmail} - no RESEND_API_KEY set, skipping notification email\n`
    )
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to,
      reply_to: removedByEmail,
      subject: `You've been removed from ${teamName} in ${orgName} on itsasecret`,
      html: teamRemovedEmailHtml({ teamName, orgName, removedByEmail }),
      text: `${removedByEmail} removed you from the team "${teamName}" in the organization "${orgName}" on itsasecret.\n\nYou keep any access granted to you individually or through other teams.`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`[email] Resend team-removed send failed (${res.status}): ${detail}`)
  }
}

export interface SendFeedbackEmailArgs {
  fromUserEmail: string
  fromUserName: string | null
  message: string
}

// Forwards profile-page feedback to FEEDBACK_EMAIL. Best-effort on top of the
// DB row (the feedback table is the source of truth) - a mail hiccup must
// never fail the submission.
export async function sendFeedbackEmail({ fromUserEmail, fromUserName, message }: SendFeedbackEmailArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.FEEDBACK_EMAIL

  const who = fromUserName ? `${fromUserName} <${fromUserEmail}>` : fromUserEmail
  if (!apiKey || !to) {
    console.log(`\n[email:dev] Feedback from ${who}:\n${message}\n`)
    return
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
      to,
      reply_to: fromUserEmail,
      subject: `itsasecret feedback from ${who}`,
      text: message,
    }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`[email] Resend feedback send failed (${res.status}): ${detail}`)
  }
}

// Org names and inviter emails are user-controlled - escape them before
// interpolating into email HTML.
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function orgInviteEmailHtml({ orgName, inviterEmail, role, acceptUrl }: Omit<SendOrgInviteEmailArgs, 'to'>): string {
  return `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5;">
    <p><strong>${escapeHtml(inviterEmail)}</strong> invited you to join the organization <strong>${escapeHtml(orgName)}</strong> on itsasecret as ${role === 'admin' ? 'an admin' : 'a member'}.</p>
    <p><a href="${escapeHtml(acceptUrl)}">Accept invitation</a></p>
    <p style="color:#666;font-size:12px;">This link expires in 7 days. If you weren't expecting this, ignore this email.</p>
  </body>
</html>`
}

function teamAddedEmailHtml({ teamName, orgName, addedByEmail, dashboardUrl }: Omit<SendTeamAddedEmailArgs, 'to'>): string {
  return `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5;">
    <p><strong>${escapeHtml(addedByEmail)}</strong> added you to the team <strong>${escapeHtml(teamName)}</strong> in the organization <strong>${escapeHtml(orgName)}</strong> on itsasecret.</p>
    <p>You now have whatever project and environment access is granted to ${escapeHtml(teamName)}.</p>
    <p><a href="${escapeHtml(dashboardUrl)}">Open the dashboard</a></p>
    <p style="color:#666;font-size:12px;">No action is needed. If this seems wrong, contact an organization admin.</p>
  </body>
</html>`
}

function teamRemovedEmailHtml({ teamName, orgName, removedByEmail }: Omit<SendTeamRemovedEmailArgs, 'to'>): string {
  return `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5;">
    <p><strong>${escapeHtml(removedByEmail)}</strong> removed you from the team <strong>${escapeHtml(teamName)}</strong> in the organization <strong>${escapeHtml(orgName)}</strong> on itsasecret.</p>
    <p>You keep any access granted to you individually or through other teams.</p>
    <p style="color:#666;font-size:12px;">No action is needed. If this seems wrong, contact an organization admin.</p>
  </body>
</html>`
}

function verificationEmailHtml(verifyUrl: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5;">
    <p>Welcome to itsasecret.</p>
    <p>Confirm your email address to finish setting up your account:</p>
    <p><a href="${escapeHtml(verifyUrl)}">Verify email</a></p>
    <p style="color:#666;font-size:12px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
  </body>
</html>`
}
