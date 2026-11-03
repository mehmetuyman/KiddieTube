import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('i18n', () => {
  it('defaults to Turkish on a Turkish device and English otherwise', async () => {
    vi.stubGlobal('navigator', { language: 'tr-TR' })
    expect((await import('./i18n')).getLang()).toBe('tr')
    vi.stubGlobal('navigator', { language: 'en-US' })
    expect((await import('./i18n')).getLang()).toBe('en')
  })

  it('a saved choice wins over the device language', async () => {
    vi.stubGlobal('navigator', { language: 'en-US' })
    const { setLang, getLang } = await import('./i18n')
    setLang('tr')
    expect(getLang()).toBe('tr')
  })

  it('both languages define every string', async () => {
    vi.stubGlobal('navigator', { language: 'tr-TR' })
    const trT = (await import('./i18n')).t
    vi.resetModules()
    vi.stubGlobal('navigator', { language: 'en-US' })
    const enT = (await import('./i18n')).t
    expect(Object.keys(trT).sort()).toEqual(Object.keys(enT).sort())
    expect(Object.keys(trT.status).sort()).toEqual(Object.keys(enT.status).sort())
    expect(trT.allVideos).toBe('Tüm Videolar')
    expect(enT.videosCount(1)).toBe('1 video')
    expect(enT.videosCount(2)).toBe('2 videos')
  })
})
