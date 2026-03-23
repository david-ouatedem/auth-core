import { Module, Global } from '@nestjs/common'
import type { DynamicModule } from '@nestjs/common'
import { createAuth as createCoreAuth } from '@authcore/core'
import type { AuthCoreConfig } from '@authcore/core'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { AuthOptionalGuard } from './auth-optional.guard.js'
import { RolesGuard } from './roles.guard.js'
import { AUTH_CORE, AUTH_MODULE_OPTIONS } from './constants.js'

export interface AuthModuleOptions extends AuthCoreConfig {
  /** Base URL used to build links in emails (e.g. 'https://myapp.com') */
  baseUrl?: string
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

    return {
      module: AuthModule,
      controllers: [AuthController],
      providers: [
        authCoreProvider,
        optionsProvider,
        AuthGuard,
        AuthOptionalGuard,
        RolesGuard,
      ],
      exports: [
        authCoreProvider,
        optionsProvider,
        AuthGuard,
        AuthOptionalGuard,
        RolesGuard,
      ],
    }
  }
}
