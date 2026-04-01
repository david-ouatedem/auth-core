import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthWebService } from '../AuthWebService.js';
import type { PublicUser } from '@authcore/types';

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

describe('AuthWebService — transformers', () => {
  const baseState = {
    baseUrl: 'http://api.example.com',
    mode: 'api' as const,
    persistSession: false,
    storageKey: 'authcore_token',
    token: null,
    user: null,
    error: null,
    isLoading: false,
    isAuthenticated: false,
  };

  beforeEach(() => {
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

  it('transformAuthResponse maps custom sign-in response shape', async () => {
    // Backend returns { data: { user }, access_token } instead of { user, token }
    const backendResponse = { data: { user: mockUser }, access_token: 'custom-token' };
    vi.stubGlobal('fetch', mockFetch({ 'POST /login': { status: 200, body: backendResponse } }));

    const service = new AuthWebService(baseState, undefined, {
      transformers: {
        transformAuthResponse: (raw) => {
          const r = raw as typeof backendResponse
          return { user: r.data.user, token: r.access_token }
        },
      },
    });

    const result = await service.signIn({ email: 'test@example.com', password: 'pass' });

    expect(result.user).toEqual(mockUser);
    expect(result.token).toBe('custom-token');
    expect(service.getState().user).toEqual(mockUser);
    expect(service.getState().token).toBe('custom-token');
    expect(service.getState().isAuthenticated).toBe(true);
  });

  it('transformAuthResponse maps custom sign-up response shape', async () => {
    const backendResponse = { data: { user: mockUser }, access_token: 'signup-token' };
    vi.stubGlobal('fetch', mockFetch({ 'POST /register': { status: 201, body: backendResponse } }));

    const service = new AuthWebService(baseState, undefined, {
      transformers: {
        transformAuthResponse: (raw) => {
          const r = raw as typeof backendResponse
          return { user: r.data.user, token: r.access_token }
        },
      },
    });

    const result = await service.signUp({ email: 'test@example.com', password: 'pass' });

    expect(result.user).toEqual(mockUser);
    expect(result.token).toBe('signup-token');
    expect(service.getState().isAuthenticated).toBe(true);
  });

  it('transformAuthResponse maps custom acceptInvitation response shape', async () => {
    const backendResponse = { data: { user: mockUser }, access_token: 'invite-token' };
    vi.stubGlobal('fetch', mockFetch({ 'POST /accept-invitation': { status: 200, body: backendResponse } }));

    const service = new AuthWebService(baseState, undefined, {
      transformers: {
        transformAuthResponse: (raw) => {
          const r = raw as typeof backendResponse
          return { user: r.data.user, token: r.access_token }
        },
      },
    });

    const result = await service.acceptInvitation('invite-token-123', 'password');

    expect(result.user).toEqual(mockUser);
    expect(result.token).toBe('invite-token');
    expect(service.getState().isAuthenticated).toBe(true);
  });

  it('transformUser maps custom /me response shape', async () => {
    const backendMe = { profile: mockUser }
    vi.stubGlobal('fetch', mockFetch({ 'GET /me': { status: 200, body: backendMe } }));

    const service = new AuthWebService(baseState, undefined, {
      transformers: {
        transformUser: (raw) => (raw as typeof backendMe).profile,
      },
    });

    await service.refreshUser();

    expect(service.getState().user).toEqual(mockUser);
    expect(service.getState().isAuthenticated).toBe(true);
  });

  it('extended user fields are preserved in state via transformUser', async () => {
    interface ExtendedUser extends PublicUser { avatarUrl: string }
    const extendedUser: ExtendedUser = { ...mockUser, avatarUrl: 'https://cdn.example.com/avatar.png' };

    vi.stubGlobal('fetch', mockFetch({ 'GET /me': { status: 200, body: { data: extendedUser } } }));

    const service = new AuthWebService<ExtendedUser>(baseState, undefined, {
      transformers: {
        transformUser: (raw) => (raw as { data: ExtendedUser }).data,
      },
    });

    await service.refreshUser();

    expect((service.getState().user as ExtendedUser)?.avatarUrl).toBe('https://cdn.example.com/avatar.png');
  });

  it('transformError maps custom error body to message on signIn failure', async () => {
    vi.stubGlobal('fetch', mockFetch({ 'POST /login': { status: 401, body: { message: 'Wrong credentials' } } }));

    const service = new AuthWebService(baseState, undefined, {
      transformers: {
        transformError: (body) => (body as { message: string }).message,
      },
    });

    await expect(service.signIn({ email: 'test@example.com', password: 'wrong' }))
      .rejects.toThrow('Wrong credentials');
    expect(service.getState().error).toBe('Wrong credentials');
  });

  it('uses custom httpClient instead of fetch', async () => {
    const customGet = vi.fn().mockResolvedValue(mockUser);
    const customPost = vi.fn().mockResolvedValue({ user: mockUser, token: 'custom-client-token' });

    const service = new AuthWebService(baseState, undefined, {
      httpClient: { get: customGet, post: customPost },
    });

    await service.refreshUser();
    expect(customGet).toHaveBeenCalledWith('/me');
    expect(service.getState().user).toEqual(mockUser);

    await service.signIn({ email: 'a@b.com', password: 'pass' });
    expect(customPost).toHaveBeenCalledWith('/login', { email: 'a@b.com', password: 'pass' });
    expect(service.getState().token).toBe('custom-client-token');
  });

  it('custom httpClient with transformAuthResponse work together', async () => {
    const customPost = vi.fn().mockResolvedValue({ data: { user: mockUser }, jwt: 'jwt-abc' });

    const service = new AuthWebService(baseState, undefined, {
      httpClient: { get: vi.fn(), post: customPost },
      transformers: {
        transformAuthResponse: (raw) => {
          const r = raw as { data: { user: typeof mockUser }; jwt: string }
          return { user: r.data.user, token: r.jwt }
        },
      },
    });

    const result = await service.signIn({ email: 'a@b.com', password: 'pass' });

    expect(result.user).toEqual(mockUser);
    expect(result.token).toBe('jwt-abc');
    expect(service.getState().isAuthenticated).toBe(true);
  });
});
