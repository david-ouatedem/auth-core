import { Injectable, Inject, Optional } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { AuthCore } from '@authcore/core'
import { AUTH_CORE, AUTH_COOKIE_NAME } from './constants.js'

/**
 * Guard that optionally attaches `request.user` if a valid token is present.
 * Never rejects the request. Use for routes that behave differently
 * based on authentication state.
 *
 * @example
 * ```ts
 * @UseGuards(AuthOptionalGuard)
 * @Get('public')
 * getPublic(@CurrentUser() user: PublicUser | undefined) {
 *   return { user: user ?? null }
 * }
 * ```
 */
@Injectable()
export class AuthOptionalGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CORE) private readonly auth: AuthCore,
    @Optional() @Inject(AUTH_COOKIE_NAME) private readonly cookieName: string = 'authcore_token',
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = this.extractToken(request)

    if (token) {
      const user = await this.auth.verifyToken(token)
      if (user) {
        request.user = user
      }
    }

    return true
  }

  private extractToken(request: {
    headers: Record<string, string | undefined>
    cookies?: Record<string, string>
  }): string | null {
    const authHeader = request.headers['authorization'] as string | undefined
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    return request.cookies?.[this.cookieName] ?? null
  }
}
