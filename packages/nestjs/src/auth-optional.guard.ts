import { Injectable, Inject } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import type { AuthCore } from '@authcore/core'
import { AUTH_CORE } from './constants.js'

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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers['authorization'] as string | undefined

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const user = await this.auth.verifyToken(token)
      if (user) {
        request.user = user
      }
    }

    return true
  }
}
