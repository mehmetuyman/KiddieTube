import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>

/** Random, URL-safe identifier for rows. */
export const newId = (prefix = '') => prefix + randomBytes(12).toString('base64url')

/** High-entropy secret handed to a client once (device keys, invite tokens). */
export const newSecret = () => randomBytes(32).toString('base64url')

/** Secrets with 256 bits of entropy only need a fast hash for storage. */
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

/** Slow hash for low-entropy secrets (4–8 digit PINs). Format: scrypt$salt$hash */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(pin, salt, 32)
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`
}

export async function verifyPinHash(pin: string, stored: string): Promise<boolean> {
  const [alg, saltB64, hashB64] = stored.split('$')
  if (alg !== 'scrypt' || !saltB64 || !hashB64) return false
  const expected = Buffer.from(hashB64, 'base64')
  const actual = await scrypt(pin, Buffer.from(saltB64, 'base64'), expected.length)
  return timingSafeEqual(actual, expected)
}
