// Recognising PostgreSQL errors through Drizzle's wrapper (DrizzleQueryError
// keeps the driver error as `cause`).

/** A unique constraint was violated (SQLSTATE 23505). */
export function isUniqueViolation(e: unknown): boolean {
  for (let err = e as { code?: string; cause?: unknown } | undefined; err; err = err.cause as typeof err) {
    if (err.code === '23505') return true
  }
  return false
}
