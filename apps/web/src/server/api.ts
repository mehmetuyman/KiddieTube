// Small typed client for the Kiddie Tube API (server mode only).
// Same-origin requests; the parent session is an HttpOnly cookie.
import { API_PREFIX } from '@kiddietube/shared/constants'
import type { ApiError } from '@kiddietube/shared'
import { getLang } from '../lib/i18n'

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
  /** The server couldn't be reached at all (home server unplugged, offline). */
  get offline() {
    return this.status === 0
  }
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

export async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { headers?: Record<string, string>; timeoutMs?: number; raw?: boolean } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${base}${path}`, {
      method,
      credentials: 'same-origin',
      // the server answers errors and sends emails in this device's language
      headers: { 'x-kt-lang': getLang(), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...opts.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    })
  } catch {
    throw new ApiRequestError(0, 'offline', getLang() === 'tr' ? 'Sunucuya şu anda ulaşılamıyor.' : 'Can’t reach the server right now.')
  }
  if (opts.raw) return res as unknown as T
  if (res.status === 204) return undefined as T
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const err = (data as ApiError | null)?.error
    const msg = err?.message ?? (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`
    throw new ApiRequestError(res.status, err?.code ?? 'error', msg, err?.details)
  }
  return data as T
}

const safeJson = (s: string): unknown => {
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

export const api = {
  get: <T>(p: string) => request<T>('GET', `${API_PREFIX}${p}`),
  post: <T>(p: string, b?: unknown) => request<T>('POST', `${API_PREFIX}${p}`, b ?? {}),
  patch: <T>(p: string, b: unknown) => request<T>('PATCH', `${API_PREFIX}${p}`, b),
  put: <T>(p: string, b: unknown) => request<T>('PUT', `${API_PREFIX}${p}`, b),
  del: <T = void>(p: string, b?: unknown) => request<T>('DELETE', `${API_PREFIX}${p}`, b),
}

/** Better Auth endpoints (/api/auth/*). */
export const authApi = {
  signIn: (email: string, password: string) => request('POST', '/api/auth/sign-in/email', { email, password }),
  signUp: (email: string, password: string, name: string) => request('POST', '/api/auth/sign-up/email', { email, password, name }),
  signOut: () => request('POST', '/api/auth/sign-out', {}),
  requestReset: (email: string) =>
    request('POST', '/api/auth/request-password-reset', { email, redirectTo: `${base}/reset-password` }),
  resetPassword: (token: string, newPassword: string) => request('POST', '/api/auth/reset-password', { token, newPassword }),
}
