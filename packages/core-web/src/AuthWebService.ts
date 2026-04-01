import type { AuthWebRoutesInterface } from './types/AuthWebRoutes.interface.js'
import type { AuthResponse, AuthWebServiceResponseInterface } from './types/AuthWebService.response.js'
import type { AuthWebStateInterface } from './types/AuthWebState.interface.js'
import type { HttpClient } from './types/HttpClients.interface.js'
import { createFetchAuthClient } from './http-client/createFetchAuthClient.js'
import type { PublicUser } from '@authcore/types'

export interface AuthResponseTransformers<TUser extends PublicUser = PublicUser> {
  /** Map your backend's sign-in / sign-up / accept-invitation response to { user, token? } */
  transformAuthResponse?: (raw: unknown) => { user: TUser; token?: string }
  /** Map your backend's /me response to a user object */
  transformUser?: (raw: unknown) => TUser
  /** Map your backend's error body to an error message string */
  transformError?: (body: unknown, status: number) => string
}

/** All route paths with defaults applied. */
interface ResolvedRoutes {
  register: string
  login: string
  logout: string
  me: string
  verifyEmail: string
  forgotPassword: string
  resetPassword: string
  invite: string
  acceptInvitation: string
}

export class AuthWebService<TUser extends PublicUser = PublicUser>
  implements AuthWebServiceResponseInterface<TUser> {
  private state: AuthWebStateInterface<TUser>
  private paths: ResolvedRoutes
  private client: HttpClient
  private listeners: Set<() => void>
  private transformers: AuthResponseTransformers<TUser>

  constructor(
    initialState: AuthWebStateInterface<TUser>,
    routes?: AuthWebRoutesInterface,
    options?: { transformers?: AuthResponseTransformers<TUser>; httpClient?: HttpClient },
  ) {
    this.state = initialState
    this.transformers = options?.transformers ?? {}

    if (typeof window !== 'undefined' && this.state.mode === 'api' && this.state.persistSession) {
      const stored = localStorage.getItem(this.state.storageKey ?? 'authcore_token')
      if (stored) {
        this.state.token = stored
      }
    }

    this.client = options?.httpClient ?? createFetchAuthClient({
      baseUrl: initialState.baseUrl,
      mode: initialState.mode,
      getToken: () => this.state.token ?? null,
      ...(this.transformers.transformError ? { transformError: this.transformers.transformError } : {}),
    })

    this.paths = {
      register: routes?.register ?? '/register',
      login: routes?.login ?? '/login',
      logout: routes?.logout ?? '/logout',
      me: routes?.me ?? '/me',
      verifyEmail: routes?.verifyEmail ?? '/verify-email',
      forgotPassword: routes?.forgotPassword ?? '/forgot-password',
      resetPassword: routes?.resetPassword ?? '/reset-password',
      invite: routes?.invite ?? '/invite',
      acceptInvitation: routes?.acceptInvitation ?? '/accept-invitation',
    }

    this.listeners = new Set()
  }

  async signIn({ email, password }: { email: string; password: string }): Promise<AuthResponse<TUser>> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      const raw = await this.client.post<unknown>(this.paths.login, { email, password })
      const response = this.transformers.transformAuthResponse
        ? this.transformers.transformAuthResponse(raw)
        : raw as AuthResponse<TUser>
      this.state = {
        ...this.state,
        user: response.user,
        token: response.token ?? '',
        isAuthenticated: true,
        isLoading: false,
      }
      this.setToken(response.token ?? null)
      this.notifyListeners()
      return response
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async signUp({ email, password }: { email: string; password: string }): Promise<AuthResponse<TUser>> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      const raw = await this.client.post<unknown>(this.paths.register, { email, password })
      const response = this.transformers.transformAuthResponse
        ? this.transformers.transformAuthResponse(raw)
        : raw as AuthResponse<TUser>
      this.state = {
        ...this.state,
        user: response.user,
        token: response.token ?? '',
        isAuthenticated: true,
        isLoading: false,
      }
      this.setToken(response.token ?? null)
      this.notifyListeners()
      return response
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async signOut(): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      await this.client.post(this.paths.logout)
      this.state = { ...this.state, user: null, token: '', isAuthenticated: false, isLoading: false }
      this.setToken(null)
      this.notifyListeners()
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      this.notifyListeners()
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async verifyEmail(token: string): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      await this.client.post(this.paths.verifyEmail, { token })
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async forgotPassword(email: string): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      await this.client.post(this.paths.forgotPassword, { email })
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      await this.client.post(this.paths.resetPassword, { token, password })
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async invite(email: string, role?: string): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      await this.client.post(this.paths.invite, { email, role })
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async acceptInvitation(token: string, password: string): Promise<AuthResponse<TUser>> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      const raw = await this.client.post<unknown>(
        this.paths.acceptInvitation,
        { token, password },
      )
      const response = this.transformers.transformAuthResponse
        ? this.transformers.transformAuthResponse(raw)
        : raw as AuthResponse<TUser>
      this.state = {
        ...this.state,
        user: response.user,
        token: response.token ?? '',
        isAuthenticated: true,
        isLoading: false,
      }
      this.setToken(response.token ?? null)
      this.notifyListeners()
      return response
    } catch (error) {
      this.state = { ...this.state, error: error instanceof Error ? error.message : 'Unknown error' }
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  async refreshUser(): Promise<void> {
    try {
      this.state = { ...this.state, isLoading: true }
      this.notifyListeners()

      const raw = await this.client.get<unknown>(this.paths.me)
      const user = this.transformers.transformUser
        ? this.transformers.transformUser(raw)
        : raw as TUser
      this.state = { ...this.state, user, isLoading: false, isAuthenticated: true }
      this.notifyListeners()
    } catch (error) {
      this.state = {
        ...this.state,
        error: error instanceof Error ? error.message : 'Unknown error',
        user: null,
        isAuthenticated: false,
      }
      this.setToken(null)
      this.notifyListeners()
      throw error
    } finally {
      this.state = { ...this.state, isLoading: false }
      this.notifyListeners()
    }
  }

  private setToken = (token: string | null) => {
    if (this.state.mode === 'api' && this.state.persistSession) {
      if (token) {
        localStorage.setItem(this.state.storageKey, token)
      } else {
        localStorage.removeItem(this.state.storageKey)
      }
    }
  }

  getState() {
    return this.state
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener())
  }
}
