import { Injectable, Inject, Optional, UnauthorizedException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthCore } from '@authcore/core'
import { AUTH_CORE, AUTH_COOKIE_NAME, IS_PUBLIC_KEY } from './constants.js'

/**
 * Guard that requires a valid JWT token.
 * Extracts the Bearer token from the Authorization header (or the configured
 * cookie if cookie auth is enabled), validates it, and attaches the user to
 * `request.user`.
 *
 * Throws `UnauthorizedException` (401) if no token is present or the token is
 * invalid. Pair with `RolesGuard` for 403/role-based denials.
 *
 * @example
 * ```ts
 * @UseGuards(AuthGuard)
 * @Get('dashboard')
 * getDashboard(@CurrentUser() user: PublicUser) { ... }
 * ```
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_CORE) private readonly auth: AuthCore,
    @Optional() @Inject(AUTH_COOKIE_NAME) private readonly cookieName: string = 'authcore_token',
    @Optional() @Inject(Reflector) private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
      if (isPublic) return true
    }

    const request = context.switchToHttp().getRequest()
    const token = this.extractToken(request)

    if (!token) {
      throw new UnauthorizedException('Authentication required')
    }

    const user = await this.auth.verifyToken(token)
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token')
    }

    request.user = user
    return true
  }

  private extractToken(request: {
    headers: Record<string, string | undefined>
    cookies?: Record<string, string>
  }): string | null {
    const authHeader = request.headers['authorization']
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    return request.cookies?.[this.cookieName] ?? null
  }
}
