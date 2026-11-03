import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details)
export const unauthorized = (message = 'Sign in required') => new HttpError(401, 'unauthorized', message)
export const forbidden = (message = 'Not allowed') => new HttpError(403, 'forbidden', message)
export const notFound = (what = 'Not found') => new HttpError(404, 'not_found', what)
export const conflict = (message: string) => new HttpError(409, 'conflict', message)
export const tooMany = (message: string) => new HttpError(429, 'too_many_requests', message)

/** Uniform `{ error: { code, message, details? } }` responses; no stack traces leak. */
export function errorHandler(err: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  if (err instanceof HttpError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } })
  }
  if (err instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: 'validation_failed',
        message: 'Some fields are invalid',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    })
  }
  const status = (err as FastifyError).statusCode
  if (status && status >= 400 && status < 500) {
    return reply.status(status).send({ error: { code: (err as FastifyError).code ?? 'bad_request', message: err.message } })
  }
  req.log.error({ err }, 'unhandled error')
  return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong' } })
}
