import { createParamDecorator, SetMetadata } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { ROLES_KEY, IS_PUBLIC_KEY } from './constants.js'

/**
 * Parameter decorator that extracts the authenticated user from the request.
 *
 * @example
 * ```ts
 * @Get('profile')
 * @UseGuards(AuthGuard)
 * getProfile(@CurrentUser() user: PublicUser) {
 *   return user
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest()
    return request.user
  },
)

/**
 * Decorator that sets the allowed roles for a route or controller.
 * Use with `RolesGuard`.
 *
 * @example
 * ```ts
 * @UseGuards(AuthGuard, RolesGuard)
 * @Roles('admin', 'editor')
 * @Get('staff')
 * getStaff() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)

/**
 * Decorator that marks a route as public (skips auth guards that check for it).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
