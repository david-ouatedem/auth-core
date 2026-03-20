import { Injectable, ForbiddenException } from '@nestjs/common'
import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from './constants.js'

/**
 * Guard that checks `request.user.role` against the roles set by the `@Roles()` decorator.
 * Must be used after `AuthGuard` (so that `request.user` is populated).
 *
 * If no `@Roles()` decorator is present, the guard allows the request through.
 *
 * @example
 * ```ts
 * @UseGuards(AuthGuard, RolesGuard)
 * @Roles('admin')
 * @Get('admin')
 * getAdmin() { ... }
 * ```
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const user = request.user

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
