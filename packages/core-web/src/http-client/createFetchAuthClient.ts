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

export function createFetchAuthClient(config: AuthClientConfig): HttpClient {
  const { baseUrl, mode, getToken, transformError } = config

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
