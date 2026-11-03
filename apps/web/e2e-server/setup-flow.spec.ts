import { expect, test } from '../e2e/fixtures'

// One story, in order: the instance admin's first visit through to a paired
// kids' device that keeps working with the server unreachable.
test('admin creates a family, adds content, pairs a device; the kids page works offline', async ({ page }) => {
  let promptAnswer = ''
  page.on('dialog', (d) => void d.accept(promptAnswer))

  // 1. First account (instance admin) via /join without an invite
  await page.goto('./join')
  await page.getByLabel('Your name').fill('Admin')
  await page.getByLabel(/^Email/).fill('admin@example.com')
  await page.getByLabel(/^Password/).fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()

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
  await page.getByRole('button', { name: 'Save' }).click()
  promptAnswer = 'Test tablet'
  await page.getByRole('button', { name: 'Use this device' }).click()
  await expect(page.locator('.pp-notice')).toContainText('This device now shows Ali’s videos')
  await expect(page.locator('.pp-tag', { hasText: 'This device' })).toBeVisible()

  // 5. The kids' page shows the family's content
  await page.getByRole('button', { name: '← Kids’ view' }).click()
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
  await expect(page.locator('.category-pill .category-name')).toHaveText(['All', 'Songs'])

  // 6. Server unreachable (home server unplugged): still works from the device's copy
  await page.route('**/api/**', (r) => r.abort())
  await page.reload()
  await expect(page.locator('.video-card-title')).toHaveText(['Video aaaaaaaaaaa'])
  await page.locator('.video-card').first().click()
  await expect(page.locator('#videoStatus')).toHaveText('Playing')

  // ...and the parent console says so instead of failing
  await page.goto('./parent')
  await expect(page.getByText('can’t be reached right now')).toBeVisible()
})

test('an uninvited email cannot create an account', async ({ page }) => {
  await page.goto('./join')
  await page.getByLabel('Your name').fill('Stranger')
  await page.getByLabel(/^Email/).fill('stranger@example.com')
  await page.getByLabel(/^Password/).fill('correct-horse-battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.locator('.pp-error')).toBeVisible()
  await expect(page.getByLabel('Family name')).toHaveCount(0)
})
