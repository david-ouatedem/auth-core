import { Module, Global } from '@nestjs/common'
import type { DynamicModule } from '@nestjs/common'
import { createAuth as createCoreAuth } from '@authcore/core'
import type { AuthCoreConfig } from '@authcore/types'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { AuthOptionalGuard } from './auth-optional.guard.js'
import { RolesGuard } from './roles.guard.js'
import { CsrfGuard } from './csrf.guard.js'
import {
  AUTH_CORE,
  AUTH_MODULE_OPTIONS,
  AUTH_COOKIE_NAME,
  AUTH_USE_COOKIES,
  AUTH_CSRF_ENABLED,
} from './constants.js'

export interface AuthModuleOptions extends AuthCoreConfig {
  /** Base URL used to build links in emails (e.g. 'https://myapp.com') */
  baseUrl?: string
  /**
   * When true, the controller sets/clears an httpOnly cookie on
   * register/login/logout/accept-invitation. Requires `@nestjs/platform-express`
   * and `cookie-parser` middleware registered in `main.ts`.
   */
  useCookies?: boolean
}

/**
 * NestJS module for AuthCore.
 *
 * @example
 * ```ts
 * import { AuthModule } from '@authcore/nestjs'
 *
 * @Module({
 *   imports: [
 *     AuthModule.register({
 *       db: prismaAdapter(prisma),
 *       session: { strategy: 'jwt', secret: process.env.AUTH_SECRET! },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({})
export class AuthModule {
  static register(options: AuthModuleOptions): DynamicModule {
    const authCoreProvider = {
      provide: AUTH_CORE,
      useFactory: () => createCoreAuth(options),
    }

    const optionsProvider = {
      provide: AUTH_MODULE_OPTIONS,
      useValue: { baseUrl: options.baseUrl ?? '' },
    }

    const cookieNameProvider = {
      provide: AUTH_COOKIE_NAME,
      useValue: options.session.cookieName ?? 'authcore_token',
    }

    const useCookiesProvider = {
      provide: AUTH_USE_COOKIES,
      useValue: options.useCookies ?? false,
    }

    const csrfEnabledProvider = {
      provide: AUTH_CSRF_ENABLED,
      useValue: options.session.csrf === true,
    }

    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        authCoreProvider,
        optionsProvider,
        cookieNameProvider,
        useCookiesProvider,
        csrfEnabledProvider,
        AuthGuard,
        AuthOptionalGuard,
        RolesGuard,
        CsrfGuard,
      ],
      exports: [
        authCoreProvider,
        optionsProvider,
        cookieNameProvider,
        useCookiesProvider,
        csrfEnabledProvider,
        AuthGuard,
        AuthOptionalGuard,
        RolesGuard,
        CsrfGuard,
      ],
    }
  }
}
