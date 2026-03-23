export { AuthModule } from './auth.module.js'
export type { AuthModuleOptions } from './auth.module.js'
export { AuthController } from './auth.controller.js'
export { AuthGuard } from './auth.guard.js'
export { AuthOptionalGuard } from './auth-optional.guard.js'
export { RolesGuard } from './roles.guard.js'
export { CurrentUser, Roles, Public } from './decorators.js'
export { AUTH_CORE } from './constants.js'

// Re-export core types that consumers will need
export type { AuthCoreConfig, PublicUser, DatabaseAdapter, EmailAdapter } from '@authcore/types'
export { AuthError } from '@authcore/core'
