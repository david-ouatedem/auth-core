/**
 * Internal HTTP client for AuthCore React SDK.
 * Uses native fetch — no external dependencies.
 */

import type { HttpClient } from '../types/HttpClients.interface.js'

export interface AuthClientConfig {
  baseUrl: string
  mode: 'api' | 'cookie'
  getToken: () => string | null
  /** Override how error responses are converted to a message. Receives the raw parsed body and HTTP status. */
  transformError?: (body: unknown, status: number) => string
  /**
   * Name of the CSRF cookie to read from `document.cookie` on state-changing requests.
   * Defaults to `'authcore_token_csrf'` (matches the backend cookie name when
   * `session.cookieName` is left at its default).
   *
   * When the cookie is present (i.e. the backend has `session.csrf: true`),
   * the client automatically adds it as the `X-CSRF-Token` header on POST/PUT/PATCH/DELETE.
   * No-op when the cookie isn't set.
   */
  csrfCookieName?: string
}

export interface AuthApiError {
  error: string
  code?: string
}

export class AuthRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string | undefined,
    public readonly statusCode: number,
  ) {
    super(message)
    this.name = 'AuthRequestError'
  }
}

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** Read a cookie value from `document.cookie`. Returns null in non-browser contexts. */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]!) : null
}

export function createFetchAuthClient(config: AuthClientConfig): HttpClient {
  const { baseUrl, mode, getToken, transformError, csrfCookieName = 'authcore_token_csrf' } = config

  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${baseUrl}${path}`

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    }

    if (mode === 'api') {
      const token = getToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    // Auto-attach CSRF token on state-changing requests when the cookie is present.
    const method = (options.method ?? 'GET').toUpperCase()
    if (STATE_CHANGING_METHODS.has(method) && !headers['X-CSRF-Token']) {
      const csrfValue = readCookie(csrfCookieName)
      if (csrfValue) {
        headers['X-CSRF-Token'] = csrfValue
      }
    }

    const res = await fetch(url, {
      ...options,
      headers,
      credentials: mode === 'cookie' ? 'include' : 'same-origin',
    })

    if (!res.ok) {
      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new AuthRequestError('Request failed', undefined, res.status)
      }
      if (transformError) {
        throw new AuthRequestError(transformError(body, res.status), undefined, res.status)
      }
      const apiError = body as AuthApiError
      throw new AuthRequestError(apiError.error, apiError.code, res.status)
    }

    return res.json() as Promise<T>
  }

  return {
    get: <T>(path: string) => request<T>(path, { method: 'GET' }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, {
        method: 'POST',
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
  }
}
