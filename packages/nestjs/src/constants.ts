/** Injection token for the AuthCore instance. */
export const AUTH_CORE = 'AUTH_CORE'

/** Injection token for the module configuration. */
export const AUTH_MODULE_OPTIONS = 'AUTH_MODULE_OPTIONS'

/** Metadata key for the @Roles() decorator. */
export const ROLES_KEY = 'authcore:roles'

/** Metadata key for the @Public() decorator. */
export const IS_PUBLIC_KEY = 'authcore:isPublic'

/** Injection token for the resolved cookie name. */
export const AUTH_COOKIE_NAME = 'AUTH_COOKIE_NAME'

/** Injection token for the resolved useCookies flag. */
export const AUTH_USE_COOKIES = 'AUTH_USE_COOKIES'

/** Injection token for the resolved CSRF-enabled flag (mirrors session.csrf). */
export const AUTH_CSRF_ENABLED = 'AUTH_CSRF_ENABLED'
