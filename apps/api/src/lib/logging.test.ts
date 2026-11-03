import { describe, expect, it } from 'vitest'
import { redactUrl } from './logging.ts'

describe('redactUrl [review R3-3]', () => {
  it('masks password-link tokens and the query strings of the link pages', () => {
    expect(redactUrl('/api/auth/reset-password/AbC123_-x?callbackURL=%2Freset-password%3Fnext%3D%252Faccept')).toBe(
      '/api/auth/reset-password/[token]?[redacted]',
    )
    expect(redactUrl('/reset-password?token=AbC123&next=%2Fjoin')).toBe('/reset-password?[redacted]')
    expect(redactUrl('/join?invite=secret-token')).toBe('/join?[redacted]')
    expect(redactUrl('/accept?invitation=inv_123')).toBe('/accept?[redacted]')
  })

  it('leaves everything else alone', () => {
    expect(redactUrl('/api/v1/feed')).toBe('/api/v1/feed')
    expect(redactUrl('/api/v1/families/fam_1/videos?x=1')).toBe('/api/v1/families/fam_1/videos?x=1')
  })
})
