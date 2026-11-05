import type { Page } from '@playwright/test'
import { expect, test } from '../e2e/fixtures'

/**
 * Open the newest "choose your password" link sent to `email` (dev outbox of
 * the test API), choose the password, and sign in on the page it leads to.
 */
async function finishFromEmail(page: Page, email: string) {
  const mails: { to: string; text: string }[] = await (await page.request.get('./api/v1/dev/outbox')).json()
  const mail = mails.filter((m) => m.to === email && /reset-password/.test(m.text)).pop()
  expect(mail, `password link for ${email}`).toBeTruthy()
  await page.goto(/https?:\/\/\S+reset-password\S+/.exec(mail!.text)![0])
  await page.getByLabel('Password (at least 10 characters)').fill('correct-horse-battery')
  await page.getByLabel('Confirm password').fill('correct-horse-batterz')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText("The passwords don't match.")).toBeVisible()
  await page.getByLabel('Confirm password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Password saved')).toBeVisible()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

async function signIn(page: Page, email: string) {
  await page.goto('./parent')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

// One story, in order: the instance admin's first visit through to a paired
// kids' device that keeps working with the server unreachable.
test('admin creates a family, adds content, pairs a device; the kids page works offline', async ({ page }) => {
  let promptAnswer = ''
  page.on('dialog', (d) => void d.accept(promptAnswer))

  // 1. First account (instance admin) via /join without an invite
  await page.goto('./join')
  await page.getByLabel('Your name').fill('Admin')
  await page.getByLabel(/^Email/).fill('admin@example.com')
  await page.getByRole('button', { name: 'Send me the link' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await finishFromEmail(page, 'admin@example.com') // password from the email link, then back to /join and on

  // 2. Create a family: it starts empty
  await page.getByLabel('Family name').fill('Test Family')
  await page.getByRole('button', { name: 'Create family' }).click()
  await expect(page.getByText('No videos yet')).toBeVisible()
  const getStarted = page.getByRole('complementary', { name: 'Get started' })
  await expect(getStarted).toBeVisible()
  await expect(getStarted.locator('li.done')).toHaveCount(0)

  // 3. A category, then a video into it (title looked up by the server)
  await page.locator('.pc-nav').getByRole('button', { name: /Categories/ }).click()
  await page.getByPlaceholder('New category name').fill('Songs')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.pp-row-title', { hasText: 'Songs' })).toBeVisible()

  await page.locator('.pc-nav').getByRole('button', { name: /Videos/ }).click()
  await page.getByRole('button', { name: '+ Add video' }).click()
  await page.getByLabel('YouTube link or video ID').fill('https://youtu.be/aaaaaaaaaaa')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('.pp-row-title', { hasText: 'Video aaaaaaaaaaa' })).toBeVisible()
  await expect(page.locator('.pp-row-cat', { hasText: 'Songs' })).toBeVisible()

  // 4. A kid profile, and pair THIS device with it
  await page.locator('.pc-nav').getByRole('button', { name: /Kids/ }).click()
  await page.getByRole('button', { name: '+ Add kid' }).click()
  await page.getByLabel('Name').fill('Ali')
  // "no categories" is a real choice, so the console warns about it [review R3-1]
  const allCats = page.getByLabel('All categories (and videos without a category)')
  await allCats.uncheck()
  await expect(page.getByText('this kid will see no videos')).toBeVisible()
  await allCats.check()
  await expect(page.getByText('this kid will see no videos')).toHaveCount(0)
  await page.getByRole('button', { name: 'Save' }).click()
  promptAnswer = 'Test tablet'
  const alerted = page.waitForEvent('dialog', (d) => d.type() === 'alert')
  await page.getByRole('button', { name: 'Use this device' }).click()
  expect((await alerted).message()).toContain('This device now shows Ali’s videos')

  // 5. The kids' page shows the family's content, and the parent was signed
  //    out on this (now the kid's) device [review K2]
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
  await page.goto('./parent')
  await expect(page.getByRole('heading', { name: 'Parent sign-in' })).toBeVisible()

  // 6. With a parent PIN set, opening the console from the kids' page asks for
  //    it: a wrong PIN stays on the kids' page, the right one goes on [review K1]
  await signIn(page, 'admin@example.com')
  await page.locator('.pc-nav').getByRole('button', { name: /Settings/ }).click()
  await page.getByPlaceholder('4–8 digits').fill('2468')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.locator('.pp-notice')).toHaveText('Parent PIN set.')
  const dialogs: string[] = []
  page.on('dialog', (d) => void dialogs.push(`${d.type()}:${d.message()}`))
  promptAnswer = '1111'
  await page.goto('./?parent=1')
  await expect.poll(() => dialogs).toEqual(['prompt:Parent PIN', 'alert:Wrong PIN'])
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
  // ...and the right PIN leads to the parent SIGN-IN: visiting the kids' page
  // ended the parent session on this device [review R2-1]
  promptAnswer = '2468'
  await page.goto('./?parent=1')
  await expect(page.getByRole('heading', { name: 'Parent sign-in' })).toBeVisible()

  // A parent who signs in on the kid's device is signed out again as soon as
  // they go back to the kids' page [review R2-1]
  await signIn(page, 'admin@example.com')
  await expect(page.locator('.pc-nav')).toBeVisible()
  // ...or as soon as the console page goes away (reload, tab/app closed) [review R2-7]
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Parent sign-in' })).toBeVisible()
  // Better Auth allows only a few sign-ins per client per 10 s (wanted in
  // production); this story signs in three times, so wait the window out
  await page.waitForTimeout(10_000)
  await signIn(page, 'admin@example.com')
  await expect(page.locator('.pc-nav')).toBeVisible()
  const signedOut = page.waitForResponse('**/api/auth/sign-out')
  await page.getByRole('button', { name: '← Kids’ view' }).click()
  await signedOut
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
  await page.goto('./parent')
  await expect(page.getByRole('heading', { name: 'Parent sign-in' })).toBeVisible()
  await page.goto('./')
  await expect(page.locator('.category-pill .category-name')).toHaveText(['All', 'Songs'])

  // 7. Server unreachable (home server unplugged): still works from the device's copy
  await page.route('**/api/**', (r) => r.abort())
  await page.reload()
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
  await page.locator('.video-card').first().click()
  await expect(page.locator('#videoStatus')).toHaveText('Playing')

  // ...and the parent console says so instead of failing
  await page.goto('./parent')
  await expect(page.getByText('can’t be reached right now')).toBeVisible()

  // ...and the kids' page won't open the console without the server's OK [review K1]
  dialogs.length = 0
  await page.goto('./?parent=1')
  await expect.poll(() => dialogs.join()).toContain('can’t be reached right now')
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
})

test('an uninvited email cannot create an account', async ({ page }) => {
  await page.goto('./join')
  await page.getByLabel('Your name').fill('Stranger')
  await page.getByLabel(/^Email/).fill('stranger@example.com')
  await page.getByRole('button', { name: 'Send me the link' }).click()
  await expect(page.locator('.pp-error')).toBeVisible()
  await expect(page.getByLabel('Family name')).toHaveCount(0)
})

test.describe('Turkish device', () => {
  test.use({ locale: 'tr-TR' })

  test('the console and server messages are in Turkish; the language can be switched', async ({ page }) => {
    await page.goto('./join')
    await page.getByLabel('Adınız').fill('Yabancı')
    await page.getByLabel(/^E-posta/).fill('yabanci@example.com')
    await page.getByRole('button', { name: 'Bağlantıyı gönder' }).click()
    await expect(page.locator('.pp-error')).toHaveText('Bu e-posta kayıt olamaz. Davetin gönderildiği adresi tam olarak kullanın.')

    await page.goto('./parent')
    await expect(page.getByRole('heading', { name: 'Ebeveyn girişi' })).toBeVisible()
    await page.getByLabel('Dil').selectOption('en')
    await expect(page.getByRole('heading', { name: 'Parent sign-in' })).toBeVisible()
  })
})
