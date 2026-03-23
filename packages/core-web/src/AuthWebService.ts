import { AuthWebRoutesInterface } from "./types/AuthWebRoutes.interface.js";
import { AuthWebServiceResponseInterface } from "./types/AuthWebService.response.js";
import { AuthWebStateInterface } from "./types/AuthWebState.interface.js";
import { HttpClient } from "./types/HttpClients.interface.js";
import { createFetchAuthClient } from './http-client/createFetchAuthClient.js';
import { PublicUser } from "./types/PublicUser.js";

export class AuthWebService implements AuthWebServiceResponseInterface {
    private state: AuthWebStateInterface;
    private paths: AuthWebRoutesInterface;
    private client: HttpClient
    private listeners: Set<() => void>;

    constructor(initialState: AuthWebStateInterface, routes?: AuthWebRoutesInterface) {
        this.state = initialState;
        this.client = createFetchAuthClient({
            baseUrl: initialState.baseUrl,
            mode: initialState.mode,
            getToken: () => initialState.token ?? null,
        });
        this.paths = {
            register: routes?.register ?? '/register',
            login: routes?.login ?? '/login',
            logout: routes?.logout ?? '/logout',
            me: routes?.me ?? '/me',
            verifyEmail: routes?.verifyEmail ?? '/verify-email',
            forgotPassword: routes?.forgotPassword ?? '/forgot-password',
            resetPassword: routes?.resetPassword ?? '/reset-password',
        }
        this.listeners = new Set()
    }
    async signIn<T extends { user: PublicUser; token?: string }>({ email, password }: { email: string, password: string }): Promise<T | undefined> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            const response = await this.client.post<T>(
                this.paths.login,
                { email, password },
            )
            const { user, token } = response;
            this.state = {
                ...this.state,
                user, token: token ?? "",
                isAuthenticated: true,
                isLoading: false,
            }
            this.setToken(token ?? null)
            this.notifyListeners();
            return response
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            return undefined;
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        }
    }
    async signUp<T extends { user: PublicUser; token?: string }>({ email, password }: { email: string, password: string }): Promise<T | undefined> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            const response = await this.client.post<T>(
                this.paths.register,
                { email, password },
            )
            const { user, token } = response;
            this.state = {
                ...this.state,
                user, token: token ?? "",
                isAuthenticated: true,
                isLoading: false,
            }
            this.setToken(token ?? null)
            this.notifyListeners();
            return response
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            return undefined;
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        }
    }
    async signOut(): Promise<void> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            await this.client.post(this.paths.logout)
            this.state = { ...this.state, user: null, token: "", isAuthenticated: false, isLoading: false }
            this.setToken(null)
            this.notifyListeners();
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            this.notifyListeners();
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        }
    }
    async verifyEmail(token: string): Promise<void> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            await this.client.post(this.paths.verifyEmail, { token })
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            this.notifyListeners();
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        }
    }
    async forgotPassword(email: string): Promise<void> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            await this.client.post(this.paths.forgotPassword, { email })
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            this.notifyListeners();
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        }
    }
    async resetPassword(token: string, password: string): Promise<void> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            await this.client.post(this.paths.resetPassword, { token, password })
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            this.notifyListeners();
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
        }
    }
    async refreshUser(): Promise<void> {
        try {
            this.state = { ...this.state, isLoading: true };
            this.notifyListeners();
            const response = await this.client.get<PublicUser>(this.paths.me)
            this.state = { ...this.state, user: response, isLoading: false }
            this.notifyListeners();
        } catch (error) {
            this.state = { ...this.state, error: error instanceof Error ? error.message : "Unknown error" };
            this.notifyListeners();
        } finally {
            this.state = { ...this.state, isLoading: false }
            this.notifyListeners();
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
        return this.state;
    }
    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        }
    }
    notifyListeners() {
        this.listeners.forEach(listener => listener());
    }
}
