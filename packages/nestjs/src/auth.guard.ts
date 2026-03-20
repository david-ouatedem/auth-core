import { Injectable, Inject, Optional } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { AuthCore } from '@authcore/core'
import { AUTH_CORE, IS_PUBLIC_KEY } from './constants.js'

/**
 * Guard that requires a valid JWT token.
 * Extracts the Bearer token from the Authorization header,
 * validates it, and attaches the user to `request.user`.
 *
 * Returns 401 if no token is present or the token is invalid.
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
      return false
    }

    const user = await this.auth.verifyToken(token)
    if (!user) {
      return false
    }

    request.user = user
    return true
  }

  private extractToken(request: { headers: Record<string, string | undefined> }): string | null {
    const authHeader = request.headers['authorization']
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    return null
  }
}
