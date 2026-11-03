// Kids-facing UI language (Turkish / English). Per device, like the theme:
// defaults to the device's language, can be changed in the parent console.
// Category names are family data and are shown as entered.

export const LANGS = ['tr', 'en'] as const
export type Lang = (typeof LANGS)[number]

const en = {
  all: 'All',
  allVideos: 'All Videos',
  videosCount: (n: number) => `${n} ${n === 1 ? 'video' : 'videos'}`,
  selectVideo: 'Select a video to begin',
  playing: 'Playing',
  status: { idle: 'Idle', ready: 'Ready', playing: 'Playing', paused: 'Paused', ended: 'Ended', buffering: 'Buffering' },
  playbackSpeed: 'Playback speed',
  back10: 'Back 10s',
  forward10: 'Forward 10s',
  fullscreen: 'Fullscreen',
  exitFullscreen: 'Exit fullscreen',
  reloadApp: 'Reload app',
  parentPin: 'Parent PIN',
  wrongPin: 'Wrong PIN',
  parentOffline: 'The parent area needs the Kiddie Tube server, which can’t be reached right now. Videos keep playing.',
  parentError: 'Couldn’t check the parent PIN. Please try again.',
  updateReady: 'A new version of Kiddie Tube is ready.',
  update: 'Update',
  installTitle: 'Install KiddieTube',
  installText: 'Install our app for the best fullscreen experience!',
  install: 'Install',
  maybeLater: 'Maybe Later',
  setupText: 'This device isn’t set up yet. A parent can set it up in a minute.',
  setupButton: 'Set up this device (parents)',
  otherCategory: 'Other',
}

type Dict = typeof en

const tr: Dict = {
  all: 'Tümü',
  allVideos: 'Tüm Videolar',
  videosCount: (n: number) => `${n} video`,
  selectVideo: 'Başlamak için bir video seç',
  playing: 'Oynatılıyor',
  status: { idle: 'Bekliyor', ready: 'Hazır', playing: 'Oynatılıyor', paused: 'Duraklatıldı', ended: 'Bitti', buffering: 'Yükleniyor' },
  playbackSpeed: 'Oynatma hızı',
  back10: '10 sn geri',
  forward10: '10 sn ileri',
  fullscreen: 'Tam ekran',
  exitFullscreen: 'Tam ekrandan çık',
  reloadApp: 'Uygulamayı yenile',
  parentPin: 'Ebeveyn PIN’i',
  wrongPin: 'Yanlış PIN',
  parentOffline: 'Ebeveyn alanı Kiddie Tube sunucusuna ihtiyaç duyar ve sunucuya şu anda ulaşılamıyor. Videolar oynamaya devam eder.',
  parentError: 'Ebeveyn PIN’i kontrol edilemedi. Lütfen tekrar deneyin.',
  updateReady: 'Kiddie Tube’un yeni sürümü hazır.',
  update: 'Güncelle',
  installTitle: 'KiddieTube’u yükle',
  installText: 'En iyi tam ekran deneyimi için uygulamayı yükleyin!',
  install: 'Yükle',
  maybeLater: 'Belki sonra',
  setupText: 'Bu cihaz henüz kurulmadı. Bir ebeveyn bir dakikada kurabilir.',
  setupButton: 'Bu cihazı kur (ebeveynler)',
  otherCategory: 'Diğer',
}

const DICTS: Record<Lang, Dict> = { en, tr }
const LS_LANG = 'kiddietube-lang'

const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang)

export function getLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_LANG)
    if (isLang(saved)) return saved
  } catch {
    /* storage blocked */
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en'
  return nav.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

/** Save this device's language (applies on next load). */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(LS_LANG, lang)
  } catch {
    /* ignore */
  }
}

/** The kids-facing strings for this device's language. */
export const t: Dict = DICTS[getLang()]

/** The <html lang> value. */
export const htmlLang = (): Lang => getLang()

/** A theme's name in this device's language. */
export const themeName = (theme: { name: string; en: string }): string => (getLang() === 'tr' ? theme.name : theme.en)
