// Visual themes. The choice is a per-device preference kept in localStorage -
// it is deliberately NOT part of the synced video list, so each device (and
// each child) can have its own look.
//
// Colours live in CSS (src/themes.css, tokens on :root in styles-v2.css); this
// file only lists the themes, remembers the choice and applies it as
// <html data-theme="...">. index.html repeats the id list in a tiny inline
// script that applies the theme before first paint - keep them in sync.

export type ThemeId = 'sunny' | 'ocean' | 'candy' | 'classic'

export type Theme = {
  id: ThemeId
  name: string // Turkish label, matching the category names
  en: string
  emoji: string
  /** Browser / installed-app title bar colour (<meta name="theme-color">). */
  metaColor: string
  /** Colours for the small preview in the parent panel. */
  preview: { bg: string; header: string; pill: string; pillActive: string; play: string }
}

export const THEMES: Theme[] = [
  {
    id: 'sunny',
    name: 'Güneşli',
    en: 'Sunny',
    emoji: '☀️',
    metaColor: '#ffb938',
    preview: {
      bg: 'linear-gradient(180deg, #bfe9ff 0%, #d9f7d2 55%, #fff4c2 100%)',
      header: 'linear-gradient(135deg, #ffd23f 0%, #ffa931 100%)',
      pill: 'linear-gradient(135deg, #8be07a 0%, #3cbf77 100%)',
      pillActive: 'linear-gradient(135deg, #ff9f43 0%, #ff6b4a 100%)',
      play: 'linear-gradient(135deg, #ff9f43 0%, #ff6b4a 100%)',
    },
  },
  {
    id: 'ocean',
    name: 'Okyanus',
    en: 'Ocean',
    emoji: '🐳',
    metaColor: '#0b3a66',
    preview: {
      bg: 'linear-gradient(180deg, #0f4c81 0%, #1b8bb4 55%, #5fd3c9 100%)',
      header: 'linear-gradient(135deg, #0b3a66 0%, #0f5c8f 100%)',
      pill: 'linear-gradient(135deg, #36d1dc 0%, #2a9df4 100%)',
      pillActive: 'linear-gradient(135deg, #ffe066 0%, #ffb300 100%)',
      play: 'linear-gradient(135deg, #ffd54f 0%, #ffa000 100%)',
    },
  },
  {
    id: 'candy',
    name: 'Şeker',
    en: 'Candy',
    emoji: '🍭',
    metaColor: '#ff7eb3',
    preview: {
      bg: 'linear-gradient(135deg, #ffd6e8 0%, #e5d4ff 50%, #c9f0ff 100%)',
      header: 'linear-gradient(135deg, #ff7eb3 0%, #b57bff 100%)',
      pill: 'linear-gradient(135deg, #b57bff 0%, #7f8cff 100%)',
      pillActive: 'linear-gradient(135deg, #ff7eb3 0%, #ff5c8a 100%)',
      play: 'linear-gradient(135deg, #ff7eb3 0%, #ff5c8a 100%)',
    },
  },
  {
    id: 'classic',
    name: 'Klasik',
    en: 'Classic',
    emoji: '🎨',
    metaColor: '#4a90e2',
    preview: {
      bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      header: 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)',
      pill: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      pillActive: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      play: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
  },
]

export const DEFAULT_THEME: ThemeId = 'sunny'

const LS_THEME = 'kiddietube-theme'

function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v)
}

/** This device's theme (the default when none was picked). */
export function getTheme(): ThemeId {
  try {
    const v = localStorage.getItem(LS_THEME)
    return isThemeId(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id
  const theme = THEMES.find((t) => t.id === id)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (theme && meta) meta.setAttribute('content', theme.metaColor)
}

/** Save the choice on this device only and apply it immediately. */
export function setTheme(id: ThemeId): void {
  try {
    localStorage.setItem(LS_THEME, id)
  } catch {
    /* storage unavailable - still apply for this session */
  }
  applyTheme(id)
}
