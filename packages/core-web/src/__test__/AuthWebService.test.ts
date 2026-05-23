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

// ---- 0.10: refresh tokens ----

describe('AuthWebService — refresh tokens', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
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

  it('signIn stores refreshToken in state and localStorage when persistSession', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ user: mockUser, token: 'tok', refreshToken: 'refresh-tok' }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: null,
      refreshToken: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await service.signIn({ email: 'a@b.com', password: 'pass' });

    expect(service.getState().refreshToken).toBe('refresh-tok');
    expect(localStorage.getItem('authcore_token_refresh')).toBe('refresh-tok');
  });

  it('refresh sends current refreshToken, updates state on rotation', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      calls++;
      const body = JSON.parse(init?.body as string);
      if (calls === 1) {
        // Initial signIn
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: mockUser, token: 'old-jwt', refreshToken: 'old-refresh' }),
        };
      }
      // /refresh call — server expects old-refresh, returns rotated
      expect(body.refreshToken).toBe('old-refresh');
      return {
        ok: true,
        status: 200,
        json: async () => ({ user: mockUser, token: 'new-jwt', refreshToken: 'new-refresh' }),
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: null,
      refreshToken: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    await service.signIn({ email: 'a@b.com', password: 'pass' });
    await service.refresh();

    expect(service.getState().token).toBe('new-jwt');
    expect(service.getState().refreshToken).toBe('new-refresh');
    expect(localStorage.getItem('authcore_token')).toBe('new-jwt');
    expect(localStorage.getItem('authcore_token_refresh')).toBe('new-refresh');
  });

  it('refresh failure clears state and rejects', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid refresh', code: 'INVALID_TOKEN' }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: 'old',
      refreshToken: 'bad-refresh',
      user: mockUser,
      error: null,
      isLoading: false,
      isAuthenticated: true,
    });

    await expect(service.refresh()).rejects.toThrow('Invalid refresh');
    expect(service.getState().isAuthenticated).toBe(false);
    expect(service.getState().refreshToken).toBeNull();
    expect(service.getState().user).toBeNull();
  });

  it('revokeSession posts to /revoke and clears state even on server error', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'server' }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: 'tok',
      refreshToken: 'rt',
      user: mockUser,
      error: null,
      isLoading: false,
      isAuthenticated: true,
    });

    await expect(service.revokeSession()).resolves.toBeUndefined();
    expect(service.getState().user).toBeNull();
    expect(service.getState().refreshToken).toBeNull();
  });

  it('signOut sends refreshToken in body for server-side revocation', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      expect(body.refreshToken).toBe('rt-to-revoke');
      return { ok: true, status: 200, json: async () => ({ message: 'ok' }) };
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: 'tok',
      refreshToken: 'rt-to-revoke',
      user: mockUser,
      error: null,
      isLoading: false,
      isAuthenticated: true,
    });

    await service.signOut();
    expect(service.getState().refreshToken).toBeNull();
  });

  it('restores refreshToken from localStorage on construction', () => {
    localStorage.setItem('authcore_token', 'persisted-jwt');
    localStorage.setItem('authcore_token_refresh', 'persisted-refresh');

    const service = new AuthWebService({
      baseUrl: 'http://api.example.com',
      mode: 'api',
      persistSession: true,
      storageKey: 'authcore_token',
      token: null,
      refreshToken: null,
      user: null,
      error: null,
      isLoading: false,
      isAuthenticated: false,
    });

    expect(service.getState().token).toBe('persisted-jwt');
    expect(service.getState().refreshToken).toBe('persisted-refresh');
  });

  // ---- 0.11: OAuth ----

  describe('OAuth client helpers', () => {
    it('oauthStartUrl builds the full URL with provider id substituted', () => {
      const service = new AuthWebService({
        baseUrl: 'http://api.example.com',
        mode: 'api',
        persistSession: false,
        storageKey: 'authcore_token',
        token: null,
        refreshToken: null,
        user: null,
        error: null,
        isLoading: false,
        isAuthenticated: false,
      });

      expect(service.oauthStartUrl('google')).toBe('http://api.example.com/oauth/google');
    });

    it('signInWithProvider does a full-page navigate to the start URL', () => {
      const locationHref = { value: '' };
      vi.stubGlobal('window', {
        location: {
          get href() { return locationHref.value },
          set href(v: string) { locationHref.value = v },
          hash: '',
        },
        history: { replaceState: vi.fn() },
      });

      const service = new AuthWebService({
        baseUrl: 'http://api.example.com',
        mode: 'api',
        persistSession: false,
        storageKey: 'authcore_token',
        token: null,
        refreshToken: null,
        user: null,
        error: null,
        isLoading: false,
        isAuthenticated: false,
      });

      service.signInWithProvider('google');
      expect(locationHref.value).toBe('http://api.example.com/oauth/google');
    });

    it('handleOAuthCallback (api mode) reads token+refreshToken from URL fragment then fetches /me', async () => {
      vi.stubGlobal('fetch', mockFetch({
        'GET /me': { status: 200, body: { ...mockUser, email: 'oauth-user@example.com' } },
      }));
      vi.stubGlobal('window', {
        location: {
          href: 'http://app.example.com/callback#token=jwt-from-oauth&refreshToken=ref-from-oauth',
          hash: '#token=jwt-from-oauth&refreshToken=ref-from-oauth',
        },
        history: { replaceState: vi.fn() },
      });

      const service = new AuthWebService<PublicUser>({
        baseUrl: 'http://api.example.com',
        mode: 'api',
        persistSession: true,
        storageKey: 'authcore_token',
        token: null,
        refreshToken: null,
        user: null,
        error: null,
        isLoading: false,
        isAuthenticated: false,
      });

      await service.handleOAuthCallback();

      expect(service.getState().token).toBe('jwt-from-oauth');
      expect(service.getState().refreshToken).toBe('ref-from-oauth');
      expect(service.getState().user?.email).toBe('oauth-user@example.com');
      expect(service.getState().isAuthenticated).toBe(true);
      // Token persisted in localStorage
      expect(localStorage.getItem('authcore_token')).toBe('jwt-from-oauth');
      expect(localStorage.getItem('authcore_token_refresh')).toBe('ref-from-oauth');
    });

    it('handleOAuthCallback (cookie mode) skips fragment parsing and just fetches /me', async () => {
      vi.stubGlobal('fetch', mockFetch({
        'GET /me': { status: 200, body: { ...mockUser, email: 'cookie-oauth@example.com' } },
      }));
      vi.stubGlobal('window', {
        location: { href: 'http://app.example.com/callback', hash: '' },
        history: { replaceState: vi.fn() },
      });

      const service = new AuthWebService<PublicUser>({
        baseUrl: 'http://api.example.com',
        mode: 'cookie',
        persistSession: false,
        storageKey: 'authcore_token',
        token: null,
        refreshToken: null,
        user: null,
        error: null,
        isLoading: false,
        isAuthenticated: false,
      });

      await service.handleOAuthCallback();

      expect(service.getState().user?.email).toBe('cookie-oauth@example.com');
      expect(service.getState().isAuthenticated).toBe(true);
      // No token persisted in cookie mode
      expect(localStorage.getItem('authcore_token')).toBeNull();
    });

    it('oauthStart route override threads through oauthStartUrl', () => {
      const service = new AuthWebService(
        {
          baseUrl: 'http://api.example.com',
          mode: 'api',
          persistSession: false,
          storageKey: 'authcore_token',
          token: null,
          refreshToken: null,
          user: null,
          error: null,
          isLoading: false,
          isAuthenticated: false,
        },
        { oauthStart: '/v2/sso/:provider/start' },
      );

      expect(service.oauthStartUrl('github')).toBe('http://api.example.com/v2/sso/github/start');
    });
  });
});
