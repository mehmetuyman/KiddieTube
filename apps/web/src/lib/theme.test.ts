import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_THEME, THEMES, applyTheme, getTheme, setTheme } from './theme'
import indexHtml from '../../index.html?raw'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.head.innerHTML = '<meta name="theme-color" content="#000000">'
})

describe('theme', () => {
  it('defaults to Sunny when nothing (or something unknown) is saved', () => {
    expect(DEFAULT_THEME).toBe('sunny')
    expect(getTheme()).toBe('sunny')
    localStorage.setItem('kiddietube-theme', 'not-a-theme')
    expect(getTheme()).toBe('sunny')
  })

  it('saves the choice on this device and applies it', () => {
    setTheme('ocean')
    expect(localStorage.getItem('kiddietube-theme')).toBe('ocean')
    expect(getTheme()).toBe('ocean')
    expect(document.documentElement.dataset.theme).toBe('ocean')
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#0b3a66')
  })

  it('still applies the theme when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => setTheme('candy')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('candy')
    expect(getTheme()).toBe('sunny')
  })

  it('has unique ids and a title-bar colour for every theme', () => {
    const ids = THEMES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of THEMES) {
      applyTheme(t.id)
      expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe(t.metaColor)
    }
  })

  it('index.html pre-paint script accepts exactly the theme ids', () => {
    const m = indexHtml.match(/\/\^\(([^)]+)\)\$\//)
    expect(m, 'theme id regex in index.html').toBeTruthy()
    expect(m![1].split('|').sort()).toEqual([...THEMES.map((t) => t.id)].sort())
  })
})
