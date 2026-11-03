import { expect, isTopmost, openApp, test } from './fixtures'

const status = (page: import('@playwright/test').Page) => page.locator('#videoStatus')

test.describe('kids page', () => {
  test('loads the bundled list and plays a tapped video', async ({ page }) => {
    await openApp(page)
    await expect(page.locator('.video-card')).toHaveCount(65)
    await expect(page.locator('.version-badge')).toHaveText(/^v\d+\.\d+\.\d+$/)

    const card = page.locator('.video-card').nth(3)
    const title = (await card.locator('.video-card-title').textContent())!.trim()
    await card.click()
    await expect(status(page)).toHaveText('Playing')
    await expect(page.locator('#videoTitle')).toHaveText(title)
  })

  test('speed button cycles and is remembered on this device', async ({ page }) => {
    await openApp(page)
    await page.locator('.video-card').nth(1).click()
    await expect(status(page)).toHaveText('Playing')

    const speed = page.locator('#btnSpeed')
    await expect(speed).toHaveText('1x')
    await speed.click()
    await expect(speed).toHaveText('1.25x')

    await page.reload()
    await openApp(page)
    await page.locator('.video-card').nth(2).click()
    await expect(status(page)).toHaveText('Playing')
    await expect(speed).toHaveText('1.25x')
    await expect.poll(() => page.evaluate(() => (window as any).__ytPlayer.getPlaybackRate())).toBe(1.25)
  })

  test('top bar stays pinned, compacts, and the content underneath does not move', async ({ page }) => {
    await openApp(page)
    const gridDocTop = () =>
      page.evaluate(() => Math.round(document.querySelector('.video-grid-section')!.getBoundingClientRect().top + scrollY))
    const before = await gridDocTop()

    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' as ScrollBehavior }))
    await expect(page.locator('.app-top')).toHaveClass(/is-compact/)
    expect(await page.evaluate(() => Math.round(document.querySelector('.app-top')!.getBoundingClientRect().top))).toBe(0)
    expect(await gridDocTop()).toBe(before)
    // the bar - not the player's overlays - receives taps
    expect(await isTopmost(page, '.category-pill')).toBe(true)

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
    await expect(page.locator('.app-top')).not.toHaveClass(/is-compact/)
  })

  test('category row scrolls sideways with the mouse wheel (desktop)', async ({ page, isMobile }) => {
    test.skip(isMobile, 'mouse wheel is a desktop interaction')
    await openApp(page)
    const row = page.locator('.category-pills-container')
    await row.hover()
    await page.mouse.wheel(0, 300)
    await expect.poll(() => row.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    expect(await page.evaluate(() => scrollY)).toBe(0)
  })
})

test.describe('parent panel', () => {
  test('add a video by link, then hide and unhide it', async ({ page }) => {
    await openApp(page, '?parent=1')
    const panel = page.getByRole('dialog', { name: 'Parent panel' })
    await expect(panel).toBeVisible()

    await panel.getByRole('button', { name: '+ Add video' }).click()
    await panel.getByLabel('YouTube link or video ID').fill('https://youtu.be/dQw4w9WgXcQ')
    await expect(panel.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Stubbed title from oEmbed')
    await panel.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(panel.locator('.pp-notice')).toContainText('Added')

    // newest first, in the panel and on the kids page
    await expect(panel.locator('.pp-row-title').first()).toHaveText('Stubbed title from oEmbed')
    await expect(page.locator('.video-card')).toHaveCount(66)
    await expect(page.locator('.video-card-title').first()).toHaveText('Stubbed title from oEmbed')

    const row = panel.locator('.pp-row', { hasText: 'Stubbed title from oEmbed' })
    await row.getByRole('button', { name: 'Hide' }).click()
    await expect(row).toHaveClass(/is-hidden/)
    await expect(page.locator('.video-card')).toHaveCount(65)
    await expect(page.locator('.video-card-title', { hasText: 'Stubbed title from oEmbed' })).toHaveCount(0)

    await row.getByRole('button', { name: 'Unhide' }).click()
    await expect(page.locator('.video-card')).toHaveCount(66)
  })

  test('theme choice is saved on this device', async ({ page }) => {
    await openApp(page, '?parent=1')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'sunny')
    const panel = page.getByRole('dialog', { name: 'Parent panel' })
    await panel.getByRole('button', { name: 'Theme' }).click()
    await panel.locator('.pp-theme-card', { hasText: 'Okyanus' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean')
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0b3a66')
  })
})

test.describe('fullscreen on phones without the Fullscreen API (iPhone)', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone rotation flows')
    // iPhone Safari has no element fullscreen: the app uses its own mode
    await page.addInitScript(() => {
      ;(Element.prototype as any).requestFullscreen = undefined
      ;(Element.prototype as any).webkitRequestFullscreen = undefined
    })
  })

  const rotate = async (page: import('@playwright/test').Page) => {
    const vp = page.viewportSize()!
    await page.setViewportSize({ width: vp.height, height: vp.width })
  }
  const inPseudo = (page: import('@playwright/test').Page) =>
    page.evaluate(() => document.body.classList.contains('pseudo-fullscreen'))

  test('auto fullscreen on landscape, then back to portrait: buttons still respond', async ({ page }) => {
    await openApp(page)
    await page.locator('.video-card').nth(1).click()
    await expect(status(page)).toHaveText('Playing')

    await rotate(page) // -> landscape
    await expect.poll(() => inPseudo(page)).toBe(true)

    await rotate(page) // -> portrait
    await expect.poll(() => inPseudo(page)).toBe(false)
    await expect.poll(() => page.evaluate(() => document.body.style.top)).toBe('')

    await page.locator('#btnPlayPause').scrollIntoViewIfNeeded()
    expect(await isTopmost(page, '#btnPlayPause')).toBe(true)
    await page.locator('#btnPlayPause').click()
    await expect(status(page)).toHaveText('Paused')
  })

  test('fullscreen via the button in landscape, rotate to portrait: one tap shows working controls', async ({ page }) => {
    await openApp(page)
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' as ScrollBehavior }))
    await rotate(page) // landscape, nothing playing -> no auto fullscreen
    await page.locator('#btnFullscreen').click()
    await expect.poll(() => inPseudo(page)).toBe(true)
    const lockedAt = await page.evaluate(() => -parseInt(document.body.style.top || '0', 10))

    await rotate(page) // -> portrait, still in fullscreen (entered by button)
    await page.waitForTimeout(600) // rotation settle + touch-target refresh
    expect(await inPseudo(page)).toBe(true)

    const frame = await page.locator('.video-frame').boundingBox()
    await page.touchscreen.tap(frame!.x + frame!.width / 2, frame!.y + frame!.height / 3)
    await page.waitForTimeout(300)
    await expect(page.locator('.custom-controls')).toHaveClass(/visible/) // not shown-then-hidden
    expect(await isTopmost(page, '#btnPlayPause')).toBe(true)
    expect(await isTopmost(page, '#btnExitPseudoFs')).toBe(true)

    await page.locator('#btnExitPseudoFs').click()
    await expect.poll(() => inPseudo(page)).toBe(false)
    expect(await page.evaluate(() => scrollY)).toBe(lockedAt) // back where we were
  })
})
