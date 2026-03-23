import type { PublicUser } from "@authcore/types";
import type { AuthWebStateInterface } from "./AuthWebState.interface.";

export interface AuthWebServiceResponseInterface {
    getState(): AuthWebStateInterface
    subscribe(listener: () => void): () => void
    notifyListeners(): void

    signIn<T extends { user: PublicUser; token?: string }>({ email, password }: { email: string, password: string }): Promise<T | undefined>
    signUp<T extends { user: PublicUser; token?: string }>({ email, password }: { email: string, password: string }): Promise<T | undefined>
    signOut(): Promise<void>
    verifyEmail(token: string): Promise<void>
    forgotPassword(email: string): Promise<void>
    resetPassword(token: string, password: string): Promise<void>
    refreshUser(): Promise<void>
}