import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthRequestError, createFetchAuthClient } from '../http-client/createFetchAuthClient.js';

describe('createFetchAuthClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds Authorization header in api mode when token exists', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => 'fake-jwt-token'
    });

    await client.get('/test');

    expect(mockFetch).toHaveBeenCalledWith('http://api.example.com/test', expect.objectContaining({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer fake-jwt-token'
      },
      credentials: 'same-origin'
    }));
  });

  it('omits Authorization header in api mode when token is null', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => null
    });

    await client.get('/test');

    expect(mockFetch).toHaveBeenCalledWith('http://api.example.com/test', expect.objectContaining({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    }));
  });

  it('uses credentials include and omits Authorization header in cookie mode', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'cookie',
      getToken: () => 'fake-jwt-token'
    });

    await client.get('/test');

    expect(mockFetch).toHaveBeenCalledWith('http://api.example.com/test', expect.objectContaining({
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    }));
  });

  it('serializes body and sends POST request', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ created: true })
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => null
    });

    const payload = { email: 'test@example.com', password: 'password123' };
    await client.post('/users', payload);

    expect(mockFetch).toHaveBeenCalledWith('http://api.example.com/users', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(payload)
    }));
  });

  it('throws AuthRequestError with error and code on structured failed response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid email', code: 'INVALID_EMAIL' })
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => null
    });

    try {
      await client.get('/test');
      expect.fail('Expected error to be thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AuthRequestError);
      expect(err.message).toBe('Invalid email');
      expect(err.code).toBe('INVALID_EMAIL');
      expect(err.statusCode).toBe(400);
    }
  });

  it('throws generic AuthRequestError when response json fails', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('Cannot parse JSON'); }
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => null
    });

    try {
      await client.get('/test');
      expect.fail('Expected error to be thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AuthRequestError);
      expect(err.message).toBe('Request failed');
      expect(err.code).toBeUndefined();
      expect(err.statusCode).toBe(500);
    }
  });

  it('uses transformError to extract message from a custom error shape', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: 'Email already taken', statusCode: 422 })
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => null,
      transformError: (body, status) => {
        const b = body as { message?: string }
        return b.message ?? `Error ${status}`
      }
    });

    try {
      await client.post('/register', {});
      expect.fail('Expected error to be thrown');
    } catch (err: any) {
      expect(err).toBeInstanceOf(AuthRequestError);
      expect(err.message).toBe('Email already taken');
      expect(err.statusCode).toBe(422);
    }
  });

  it('transformError fallback when message field is missing', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({})
    });
    vi.stubGlobal('fetch', mockFetch);

    const client = createFetchAuthClient({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      getToken: () => null,
      transformError: (_, status) => `Error ${status}`
    });

    try {
      await client.get('/test');
      expect.fail('Expected error to be thrown');
    } catch (err: any) {
      expect(err.message).toBe('Error 503');
    }
  });
});
