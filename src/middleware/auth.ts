import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { env } from '../config/env'
import { errorResponse, unauthorizedError } from '../lib/errors'
import type { AppEnv } from '../types'

interface AuthOptions {
  /**
   * WebSocket routes cannot send an Authorization header, so the token may
   * come from the `token` query parameter instead. Only enable for those.
   */
  allowQueryToken?: boolean
}

/**
 * Verifies the JWT (signature AND expiry) issued by the WPS backend and puts
 * the username from the configured claim into the context. One implementation
 * for both HTTP and WebSocket routes.
 *
 * All failures return the same generic 401 so the client cannot distinguish
 * missing / invalid / expired tokens. The token is never logged.
 */
export function authMiddleware(
  options: AuthOptions = {},
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let token: string | undefined

    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length)
    } else if (options.allowQueryToken) {
      const queryToken = c.req.query('token')
      if (queryToken) token = queryToken
    }

    if (!token) {
      return errorResponse(c, unauthorizedError())
    }

    try {
      const payload = await verify(token, env.JWT_SECRET, env.JWT_ALG)
      const username = payload[env.JWT_USERNAME_CLAIM]
      if (typeof username !== 'string' || username.length === 0) {
        return errorResponse(c, unauthorizedError())
      }
      c.set('username', username)
      await next()
    } catch {
      return errorResponse(c, unauthorizedError())
    }
  }
}
