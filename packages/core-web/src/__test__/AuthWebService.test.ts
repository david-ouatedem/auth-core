import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthWebService } from '../AuthWebService.js';

const mockUser = {
  id: 'user-1',
  role: 'user',
  email: 'test@example.com',
  emailVerified: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const path = new URL(url).pathname
    const key = `${method} ${path}`
    const match = responses[key]

    if (!match) {
      return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) }
    }

    return {
      ok: match.status >= 200 && match.status < 300,
      status: match.status,
      json: async () => match.body,
    }
  }) as unknown as typeof fetch
}

describe('AuthWebService', () => {

  beforeEach(() => {
    // Basic mock just so instantiation doesn't break
    vi.stubGlobal('fetch', mockFetch({}));

    // Clear localStorage for accurate token persistence testing
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    } else {
      const store: Record<string, string> = {};
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value; },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); }
      });
    }
    vi.stubGlobal('window', {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes state correctly', () => {
    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: false,
      storageKey: 'test_token',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    expect(service.getState().baseUrl).toBe('http://api.example.com');
    expect(service.getState().isAuthenticated).toBe(false);
  });

  it('restores token from localStorage if in api mode and persistSession is true', () => {
    localStorage.setItem('authcore_token_test', 'persisted-jwt');

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token_test',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    expect(service.getState().token).toBe('persisted-jwt');
  });

  it('signUp calls /register and updates state', async () => {
    const fetchMock = mockFetch({
      'POST /register': { status: 201, body: { user: mockUser, token: 'new-token' } }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    const listener = vi.fn();
    service.subscribe(listener);

    const result = await service.signUp({ email: 'test@example.com', password: 'pass' });

    expect(result).toEqual({ user: mockUser, token: 'new-token' });
    expect(service.getState().user).toEqual(mockUser);
    expect(service.getState().token).toBe('new-token');
    expect(service.getState().isAuthenticated).toBe(true);
    expect(localStorage.getItem('authcore_token')).toBe('new-token');
    expect(listener).toHaveBeenCalled(); // notifyListeners gets called multiple times
  });

  it('signIn calls /login and updates state', async () => {
    const fetchMock = mockFetch({
      'POST /login': { status: 200, body: { user: mockUser, token: 'login-token' } }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: false,
      storageKey: 'authcore_token',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    const result = await service.signIn({ email: 'test@example.com', password: 'pass' });

    expect(result).toEqual({ user: mockUser, token: 'login-token' });
    expect(service.getState().user).toEqual(mockUser);
    expect(service.getState().token).toBe('login-token');
    expect(service.getState().isAuthenticated).toBe(true);
  });

  it('signIn throws on invalid credentials', async () => {
    const fetchMock = mockFetch({
      'POST /login': { status: 401, body: { error: 'Invalid creds' } }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: false,
      token: null,
      storageKey: 'authcore_token',
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await expect(service.signIn({ email: 'test@example.com', password: 'pass' }))
      .rejects.toThrow('Invalid creds');

    expect(service.getState().error).toBe('Invalid creds');
  });

  it('signOut calls /logout and clears state', async () => {
    const fetchMock = mockFetch({
      'POST /logout': { status: 200, body: { success: true } }
    });
    vi.stubGlobal('fetch', fetchMock);

    localStorage.setItem('authcore_token', 'old-token');

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: 'old-token',
      user: mockUser,
      error: null,
      isLoading: false,
      isAuthenticated: true,
    });

    await service.signOut();

    expect(service.getState().user).toBeNull();
    expect(service.getState().token).toBe('');
    expect(service.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('authcore_token')).toBeNull();
  });

  it('refreshUser fetches /me and hydrates state', async () => {
    const fetchMock = mockFetch({
      'GET /me': { status: 200, body: mockUser }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'cookie',
      persistSession: false,
      token: null,
      storageKey: 'authcore_token',
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await service.refreshUser();

    expect(service.getState().user).toEqual(mockUser);
    expect(service.getState().isAuthenticated).toBe(true);
  });

  it('refreshUser gracefully catches errors and unauthenticates', async () => {
    const fetchMock = mockFetch({
      'GET /me': { status: 401, body: { error: 'No session' } }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'cookie',
      persistSession: false,
      token: 'fake',
      user: mockUser,
      storageKey: 'authcore_token',
      error: null,
      isLoading: false,
      isAuthenticated: true, // Started authenticated
    });

    await expect(service.refreshUser()).rejects.toThrow('No session');

    expect(service.getState().user).toBeNull();
    expect(service.getState().isAuthenticated).toBe(false);
    expect(service.getState().error).toBe('No session');
  });

  it('verifyEmail calls /verify-email', async () => {
    const fetchMock = mockFetch({
      'POST /verify-email': { status: 200, body: {} }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: false,
      storageKey: 'authcore_token',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await service.verifyEmail('token-123');

    const verifyCall = (fetchMock as any).mock.calls.find(
      (c: any) => String(c[0]).includes('/verify-email')
    );
    expect(verifyCall).toBeDefined();
  });

  it('forgotPassword calls /forgot-password', async () => {
    const fetchMock = mockFetch({
      'POST /forgot-password': { status: 200, body: {} }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: false,
      storageKey: 'authcore_token',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await service.forgotPassword('test@example.com');

    const forgotCall = (fetchMock as any).mock.calls.find(
      (c: any) => String(c[0]).includes('/forgot-password')
    );
    expect(forgotCall).toBeDefined();
  });

  it('resetPassword calls /reset-password', async () => {
    const fetchMock = mockFetch({
      'POST /reset-password': { status: 200, body: {} }
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: false,
      storageKey: 'authcore_token',
      token: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await service.resetPassword('token-123', 'new-pass');

    const resetCall = (fetchMock as any).mock.calls.find(
      (c: any) => String(c[0]).includes('/reset-password')
    );
    expect(resetCall).toBeDefined();
  });
});
