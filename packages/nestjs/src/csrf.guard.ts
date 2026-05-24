import { Injectable, Inject, ForbiddenException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { safeCompareTokens } from '@authcore/core'
import { AUTH_COOKIE_NAME, AUTH_CSRF_ENABLED } from './constants.js'

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Synchronizer-token CSRF guard. Skips safe methods (GET/HEAD/OPTIONS). When the
 * `${cookieName}_csrf` cookie is present on the request, the `X-CSRF-Token`
 * header must match it byte-for-byte (timing-safe compare). If the cookie
 * isn't set yet (pre-login first request), the guard lets the request through
 * — register/login sets the cookie so subsequent state-changing calls are
 * protected.
 *
 * If `session.csrf: false` (default), this guard is a no-op.
 *
 * Wire it globally in `main.ts` to protect all state-changing endpoints:
 *
 * ```ts
 * import { Reflector } from '@nestjs/core'
 * const app = await NestFactory.create(AppModule)
 * app.use(cookieParser())
 * // app.useGlobalGuards(app.get(CsrfGuard))
 * ```
 *
 * Or apply per-controller with `@UseGuards(CsrfGuard)`.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CSRF_ENABLED) private readonly enabled: boolean,
    @Inject(AUTH_COOKIE_NAME) private readonly cookieName: string,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) return true
    const request = context.switchToHttp().getRequest<{
      method?: string
      cookies?: Record<string, string>
      headers: Record<string, string | string[] | undefined>
    }>()
    const method = (request.method ?? 'GET').toUpperCase()
    if (!STATE_CHANGING_METHODS.has(method)) return true

    const csrfCookieName = `${this.cookieName}_csrf`
    const cookieToken = request.cookies?.[csrfCookieName]
    if (!cookieToken) return true // first request — no CSRF cookie yet

    const headerRaw = request.headers['x-csrf-token']
    const headerValue = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw
    if (!headerValue || !safeCompareTokens(cookieToken, headerValue)) {
      throw new ForbiddenException({ error: 'CSRF token missing or invalid', code: 'CSRF_INVALID' })
    }
    return true
  }
}
