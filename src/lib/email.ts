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

function verificationEmailHtml(verifyUrl: string): string {
  return `<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; line-height: 1.5;">
    <p>Welcome to itsasecret.</p>
    <p>Confirm your email address to finish setting up your account:</p>
    <p><a href="${verifyUrl}">Verify email</a></p>
    <p style="color:#666;font-size:12px;">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
  </body>
</html>`
}
