// Outgoing email through Resend (same provider as EmlakPro). Without
// RESEND_API_KEY (development, tests) messages are logged and kept in an
// in-memory outbox instead of being sent.
import { Resend } from 'resend'
import type { Config } from './config.ts'

export interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

export interface Mailer {
  send(mail: Mail): Promise<void>
  /** Messages captured when no provider is configured (dev/tests). */
  outbox: Mail[]
}

export function createMailer(config: Config, log: (msg: string) => void = console.log): Mailer {
  const outbox: Mail[] = []
  const resend = config.RESEND_API_KEY ? new Resend(config.RESEND_API_KEY) : null
  return {
    outbox,
    async send(mail) {
      if (!resend) {
        outbox.push(mail)
        log(`[email:dev] to=${mail.to} subject="${mail.subject}"\n${mail.text}`)
        return
      }
      const { error } = await resend.emails.send({ from: config.EMAIL_FROM, ...mail })
      if (error) throw new Error(`Email send failed: ${error.message}`)
    },
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
<h2 style="margin:0 0 16px">${esc(title)}</h2><p style="line-height:1.5">${body}</p>
${cta ? `<p><a href="${esc(cta.url)}" style="display:inline-block;background:#ff8a3d;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p><p style="font-size:12px;color:#777">Or open: ${esc(cta.url)}</p>` : ''}
<p style="font-size:12px;color:#999;margin-top:32px">Kiddie Tube</p></body></html>`
}

export const emails = {
  passwordReset(to: string, url: string): Mail {
    return {
      to,
      subject: 'Reset your Kiddie Tube password',
      text: `Someone asked to reset the password for this email.\nReset it here (valid for 1 hour): ${url}\nIf it wasn't you, ignore this email.`,
      html: layout(
        'Reset your password',
        'Someone asked to reset the password for this email. The link is valid for 1 hour. If it wasn’t you, ignore this email.',
        { label: 'Reset password', url },
      ),
    }
  },
  familyInvite(to: string, inviter: string, url: string): Mail {
    return {
      to,
      subject: `${inviter} invited you to Kiddie Tube`,
      text: `${inviter} invited you to create your family's space on Kiddie Tube, a curated video player for kids.\nYour family starts empty and private.\nCreate it here (valid for 7 days): ${url}`,
      html: layout(
        'You’re invited to Kiddie Tube',
        `${esc(inviter)} invited you to create your family’s space on Kiddie Tube, a curated video player for kids. Your family starts empty and private. The link is valid for 7 days.`,
        { label: 'Create my family', url },
      ),
    }
  },
  memberInvite(to: string, inviter: string, family: string, url: string): Mail {
    return {
      to,
      subject: `${inviter} invited you to ${family} on Kiddie Tube`,
      text: `${inviter} invited you to help manage "${family}" on Kiddie Tube.\nAccept here (valid for 7 days): ${url}`,
      html: layout(`Join ${esc(family)}`, `${esc(inviter)} invited you to help manage <b>${esc(family)}</b> on Kiddie Tube. The link is valid for 7 days.`, {
        label: 'Accept invitation',
        url,
      }),
    }
  },
}
