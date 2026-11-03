// Outgoing email through Resend (same provider as EmlakPro). Without
// RESEND_API_KEY (development, tests) messages are logged and kept in an
// in-memory outbox instead of being sent.
import { Resend } from 'resend'
import type { Config } from './config.ts'
import type { Lang } from './lib/i18n.ts'

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

function layout(title: string, body: string, cta?: { label: string; url: string }, lang: Lang = 'en'): string {
  return `<!doctype html><html lang="${lang}"><body style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;color:#222">
<h2 style="margin:0 0 16px">${esc(title)}</h2><p style="line-height:1.5">${body}</p>
${cta ? `<p><a href="${esc(cta.url)}" style="display:inline-block;background:#ff8a3d;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${esc(cta.label)}</a></p><p style="font-size:12px;color:#777">${lang === 'tr' ? 'Ya da açın' : 'Or open'}: ${esc(cta.url)}</p>` : ''}
<p style="font-size:12px;color:#999;margin-top:32px">Kiddie Tube</p></body></html>`
}

export const emails = {
  verifyEmail(to: string, url: string, lang: Lang = 'en'): Mail {
    if (lang === 'tr')
      return {
        to,
        subject: 'Kiddie Tube e-posta adresinizi onaylayın',
        text: `Kiddie Tube hesabınızı tamamlamak için e-posta adresinizi onaylayın (24 saat geçerli): ${url}
Bu hesabı siz açmadıysanız bu e-postayı yok sayın.`,
        html: layout(
          'E-posta adresinizi onaylayın',
          'Kiddie Tube hesabınızı tamamlamak için e-posta adresinizi onaylayın. Bağlantı 24 saat geçerlidir. Bu hesabı siz açmadıysanız bu e-postayı yok sayın.',
          { label: 'E-postamı onayla', url },
          lang,
        ),
      }
    return {
      to,
      subject: 'Confirm your Kiddie Tube email',
      text: `Confirm your email address to finish setting up your Kiddie Tube account (valid for 24 hours): ${url}
If you didn't create this account, ignore this email.`,
      html: layout(
        'Confirm your email',
        'Confirm your email address to finish setting up your Kiddie Tube account. The link is valid for 24 hours. If you didn’t create this account, ignore this email.',
        { label: 'Confirm my email', url },
      ),
    }
  },
  passwordReset(to: string, url: string, lang: Lang = 'en'): Mail {
    if (lang === 'tr')
      return {
        to,
        subject: 'Kiddie Tube şifrenizi sıfırlayın',
        text: `Bu e-posta için şifre sıfırlama istendi.
Şifrenizi buradan sıfırlayın (1 saat geçerli): ${url}
Bunu siz istemediyseniz bu e-postayı yok sayın.`,
        html: layout(
          'Şifrenizi sıfırlayın',
          'Bu e-posta için şifre sıfırlama istendi. Bağlantı 1 saat geçerlidir. Bunu siz istemediyseniz bu e-postayı yok sayın.',
          { label: 'Şifreyi sıfırla', url },
          lang,
        ),
      }
    return {
      to,
      subject: 'Reset your Kiddie Tube password',
      text: `Someone asked to reset the password for this email.
Reset it here (valid for 1 hour): ${url}
If it wasn't you, ignore this email.`,
      html: layout(
        'Reset your password',
        'Someone asked to reset the password for this email. The link is valid for 1 hour. If it wasn’t you, ignore this email.',
        { label: 'Reset password', url },
      ),
    }
  },
  familyInvite(to: string, inviter: string, url: string, lang: Lang = 'en'): Mail {
    if (lang === 'tr')
      return {
        to,
        subject: `${inviter} sizi Kiddie Tube’a davet etti`,
        text: `${inviter} sizi, çocuklar için seçilmiş videolardan oluşan Kiddie Tube’da ailenizin alanını oluşturmaya davet etti.
Aileniz boş ve size özel olarak başlar.
Buradan oluşturun (7 gün geçerli): ${url}`,
        html: layout(
          'Kiddie Tube’a davetlisiniz',
          `${esc(inviter)} sizi, çocuklar için seçilmiş videolardan oluşan Kiddie Tube’da ailenizin alanını oluşturmaya davet etti. Aileniz boş ve size özel olarak başlar. Bağlantı 7 gün geçerlidir.`,
          { label: 'Ailemi oluştur', url },
          lang,
        ),
      }
    return {
      to,
      subject: `${inviter} invited you to Kiddie Tube`,
      text: `${inviter} invited you to create your family's space on Kiddie Tube, a curated video player for kids.
Your family starts empty and private.
Create it here (valid for 7 days): ${url}`,
      html: layout(
        'You’re invited to Kiddie Tube',
        `${esc(inviter)} invited you to create your family’s space on Kiddie Tube, a curated video player for kids. Your family starts empty and private. The link is valid for 7 days.`,
        { label: 'Create my family', url },
      ),
    }
  },
  memberInvite(to: string, inviter: string, family: string, url: string, lang: Lang = 'en'): Mail {
    if (lang === 'tr')
      return {
        to,
        subject: `${inviter} sizi Kiddie Tube’da “${family}” ailesine davet etti`,
        text: `${inviter} sizi Kiddie Tube’da "${family}" ailesini birlikte yönetmeye davet etti.
Buradan kabul edin (7 gün geçerli): ${url}`,
        html: layout(
          `${family} ailesine katılın`,
          `${esc(inviter)} sizi Kiddie Tube’da <b>${esc(family)}</b> ailesini birlikte yönetmeye davet etti. Bağlantı 7 gün geçerlidir.`,
          { label: 'Daveti kabul et', url },
          lang,
        ),
      }
    return {
      to,
      subject: `${inviter} invited you to ${family} on Kiddie Tube`,
      text: `${inviter} invited you to help manage "${family}" on Kiddie Tube.
Accept here (valid for 7 days): ${url}`,
      html: layout(`Join ${family}`, `${esc(inviter)} invited you to help manage <b>${esc(family)}</b> on Kiddie Tube. The link is valid for 7 days.`, {
        label: 'Accept invitation',
        url,
      }),
    }
  },
}
