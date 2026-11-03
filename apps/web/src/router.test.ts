import { afterEach, describe, expect, it } from 'vitest'
import { nextPath } from './router'

const at = (search: string) => window.history.replaceState(null, '', `/${search}`)

describe('nextPath (return after sign-in)', () => {
  afterEach(() => at(''))

  it('goes back to a page of this app', () => {
    at('?next=' + encodeURIComponent('/accept?invitation=inv_1'))
    expect(nextPath('/parent/videos')).toBe('/accept?invitation=inv_1')
  })

  it('never leaves the app', () => {
    for (const bad of ['https://evil.example', '//evil.example/x', 'javascript:alert(1)', '']) {
      at('?next=' + encodeURIComponent(bad))
      expect(nextPath('/parent/videos')).toBe('/parent/videos')
    }
    at('')
    expect(nextPath('/parent/videos')).toBe('/parent/videos')
  })
})
