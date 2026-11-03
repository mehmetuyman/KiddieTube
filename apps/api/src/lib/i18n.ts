// Language for server-made text (error messages, emails). The web app sends
// the device's language in `X-KT-Lang`; otherwise Accept-Language decides.
// Messages are written in English in the code; this maps them to Turkish.

export type Lang = 'tr' | 'en'

type HeaderBag = Headers | Record<string, string | string[] | undefined>

function header(h: HeaderBag, name: string): string {
  if (h instanceof Headers) return h.get(name) ?? ''
  const v = h[name]
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

export function langOf(h: HeaderBag | undefined | null): Lang {
  if (!h) return 'en'
  const explicit = header(h, 'x-kt-lang').toLowerCase()
  if (explicit === 'tr' || explicit === 'en') return explicit
  return header(h, 'accept-language').toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

/** Shown when sign-up is refused by the invite-only rule. */
export const INVITE_ONLY = 'This email can’t register. Use the exact address the invitation was sent to.'

const TR: Record<string, string> = {
  // generic
  'Sign in required': 'Giriş yapmanız gerekiyor.',
  'Not allowed': 'Bu işlem için yetkiniz yok.',
  'Not found': 'Bulunamadı.',
  'Some fields are invalid': 'Bazı alanlar geçersiz.',
  'Something went wrong': 'Bir şeyler ters gitti.',
  'Cross-site request refused': 'Başka bir siteden gelen istek reddedildi.',
  'Too many requests. Please try again later.': 'Çok fazla deneme. Lütfen biraz sonra tekrar deneyin.',
  // access
  'Instance administrators only': 'Yalnızca yöneticiler.',
  'Not a member of this family': 'Bu ailenin üyesi değilsiniz.',
  'Requires the owner role': 'Bunu yalnızca aile sahibi yapabilir.',
  'Device key required': 'Cihaz anahtarı gerekli.',
  'Unknown or revoked device': 'Bu cihaz tanınmıyor ya da erişimi kaldırılmış.',
  // content
  'Category not found': 'Kategori bulunamadı.',
  'Unknown category': 'Bilinmeyen kategori.',
  'Not a YouTube link or video id': 'Bu bir YouTube bağlantısı ya da video kimliği değil.',
  'That video is already in the list': 'Bu video zaten listede.',
  'Could not find this video (private, deleted or not embeddable?)':
    'Bu video bulunamadı (gizli, silinmiş ya da yerleştirmeye kapalı olabilir).',
  'Video not found': 'Video bulunamadı.',
  'Profile not found': 'Çocuk profili bulunamadı.',
  'Kid profile not found': 'Çocuk profili bulunamadı.',
  'Unknown kid profile': 'Bilinmeyen çocuk profili.',
  'Device not found': 'Cihaz bulunamadı.',
  'Too many wrong PINs. Try again in a few minutes.': 'Çok fazla yanlış PIN. Birkaç dakika sonra tekrar deneyin.',
  // families
  'Family not found': 'Aile bulunamadı.',
  'Type the family’s exact name to confirm': 'Onaylamak için ailenin adını tam olarak yazın.',
  'Already a member of this family': 'Zaten bu ailenin üyesisiniz.',
  'Invitation not found or expired': 'Davet bulunamadı ya da süresi dolmuş.',
  'This invitation was sent to a different email': 'Bu davet başka bir e-posta adresine gönderilmiş.',
  'A family needs at least one owner': 'Ailenin en az bir sahibi olmalı.',
  'Member not found': 'Üye bulunamadı.',
  'A family invitation is required': 'Aile oluşturmak için davet gerekli.',
  'This invitation is not valid for your account': 'Bu davet hesabınız için geçerli değil.',
  // Better Auth
  'Invalid email or password': 'E-posta ya da şifre yanlış.',
  'Invalid email': 'Geçersiz e-posta adresi.',
  'Invalid password': 'Şifre yanlış.',
  'Invalid token': 'Bu bağlantı geçersiz ya da süresi dolmuş.',
  'Password too short': 'Şifre çok kısa (en az 10 karakter).',
  'Password too long': 'Şifre çok uzun.',
  'User already exists.': 'Bu e-posta ile zaten bir hesap var.',
  'User already exists. Use another email.': 'Bu e-posta ile zaten bir hesap var.',
  'User not found': 'Kullanıcı bulunamadı.',
  'Email not verified': 'E-posta adresiniz henüz onaylanmadı. Size yeni bir onay bağlantısı gönderdik.',
  'Nothing to update': 'Değiştirilecek bir şey yok.',
  [INVITE_ONLY]: 'Bu e-posta kayıt olamaz. Davetin gönderildiği adresi tam olarak kullanın.',
}

/** Translate a server message (unknown messages are returned unchanged). */
export function translate(message: string, lang: Lang): string {
  if (lang === 'en') return message
  if (TR[message]) return TR[message]
  if (/^Rate limit exceeded/i.test(message)) return TR['Too many requests. Please try again later.']
  return message
}
