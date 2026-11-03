import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.ts'

describe('config', () => {
  it('parses boolean env vars correctly ("false" is false)', () => {
    expect(loadConfig({ FAKE_YOUTUBE_META: 'false' } as NodeJS.ProcessEnv).FAKE_YOUTUBE_META).toBe(false)
    expect(loadConfig({ FAKE_YOUTUBE_META: '1' } as NodeJS.ProcessEnv).FAKE_YOUTUBE_META).toBe(true)
    expect(loadConfig({} as NodeJS.ProcessEnv).FAKE_YOUTUBE_META).toBe(false)
  })

  it('trusts only the named proxy, never everyone', () => {
    expect(loadConfig({} as NodeJS.ProcessEnv).TRUST_PROXY).toBe('127.0.0.1')
    expect(loadConfig({ TRUST_PROXY: '127.0.0.1,::1' } as NodeJS.ProcessEnv).TRUST_PROXY).toBe('127.0.0.1,::1')
    expect(loadConfig({ TRUST_PROXY: 'false' } as NodeJS.ProcessEnv).TRUST_PROXY).toBe(false)
    expect(() => loadConfig({ TRUST_PROXY: 'true' } as NodeJS.ProcessEnv)).toThrow(/TRUST_PROXY/)
  })

  it('lower-cases and splits admin emails', () => {
    expect(loadConfig({ ADMIN_EMAILS: ' A@x.com , b@y.com,' } as NodeJS.ProcessEnv).adminEmails).toEqual(['a@x.com', 'b@y.com'])
  })

  it('refuses unsafe production settings', () => {
    const prod = { NODE_ENV: 'production', DATABASE_URL: 'postgres://u@h/db', AUTH_SECRET: 'x'.repeat(40) }
    expect(() => loadConfig(prod as NodeJS.ProcessEnv)).not.toThrow()
    expect(() => loadConfig({ ...prod, DATABASE_URL: undefined } as unknown as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ ...prod, AUTH_SECRET: undefined } as unknown as NodeJS.ProcessEnv)).toThrow(/AUTH_SECRET/)
    expect(() => loadConfig({ ...prod, FAKE_YOUTUBE_META: 'true' } as NodeJS.ProcessEnv)).toThrow(/FAKE_YOUTUBE_META/)
  })
})
