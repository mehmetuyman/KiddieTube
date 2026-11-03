import { test as base, expect, Page } from '@playwright/test'

/**
 * Deterministic stand-in for the YouTube IFrame API: the same surface the app
 * uses (cue/load/play/pause/seek/rate/state + onReady/onStateChange/
 * onPlaybackRateChange), with no network and no real video. Like the real
 * API it replaces the target element with an <iframe> of the same id.
 */
const YT_STUB = `
(() => {
  const S = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };
  class Player {
    constructor(elId, opts) {
      this.opts = opts; this.state = S.UNSTARTED; this.t = 0; this.duration = 120;
      this.rate = 1; this.videoId = null;
      const el = document.getElementById(elId);
      const iframe = document.createElement('iframe');
      iframe.id = elId; iframe.title = 'stub player'; iframe.style.background = '#123';
      el.replaceWith(iframe); this.iframe = iframe;
      window.__ytPlayer = this;
      setTimeout(() => opts.events?.onReady?.({ target: this }), 0);
    }
    _set(s) { this.state = s; this.opts.events?.onStateChange?.({ target: this, data: s }); }
    cueVideoById(id) { this.videoId = id; this.t = 0; this._set(S.CUED); }
    loadVideoById(id) { this.videoId = id; this.t = 0; this._set(S.PLAYING); }
    playVideo() { this._set(S.PLAYING); }
    pauseVideo() { this._set(S.PAUSED); }
    seekTo(t) { this.t = Math.max(0, Math.min(this.duration, t)); }
    getPlayerState() { return this.state; }
    getCurrentTime() { return this.t; }
    getDuration() { return this.duration; }
    getIframe() { return this.iframe; }
    getAvailablePlaybackRates() { return [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]; }
    getPlaybackRate() { return this.rate; }
    setPlaybackRate(r) { this.rate = r; this.opts.events?.onPlaybackRateChange?.({ target: this, data: r }); }
    destroy() {}
  }
  window.YT = { Player, PlayerState: S };
  window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();
})();
`

/** Block everything that isn't the app itself, and stub what the app needs. */
async function isolateNetwork(page: Page) {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue()
    if (url.hostname === 'www.youtube.com' && url.pathname === '/iframe_api') {
      return route.fulfill({ contentType: 'text/javascript', body: YT_STUB })
    }
    if (url.hostname === 'www.youtube.com' && url.pathname === '/oembed') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ title: 'Stubbed title from oEmbed', author_name: 'Stub Channel' }),
      })
    }
    return route.abort() // thumbnails etc.: not needed for behaviour
  })
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await isolateNetwork(page)
    await use(page)
  },
})

export { expect }

/** Open the app and wait until the player is wired up. */
export async function openApp(page: Page, query = '') {
  await page.goto(`./${query}`)
  await expect(page.locator('.video-card').first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => typeof document.getElementById('btnPlayPause')?.onclick)).toBe('function')
}

/** Is `selector`'s centre point actually the topmost (tappable) element? */
export async function isTopmost(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return false
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return !!top && (top === el || el.contains(top))
  }, selector)
}
