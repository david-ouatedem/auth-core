import { z } from 'zod'

const emailSchema = z.string().email('Invalid email address')

const passwordSchema = (minLength: number) =>
  z
    .string()
    .min(minLength, `Password must be at least ${minLength} characters`)
    .max(72, 'Password must be at most 72 characters') // bcrypt max

/** Schema for POST /register */
export const registerSchema = (minPasswordLength = 8) =>
  z.object({
    email: emailSchema,
    password: passwordSchema(minPasswordLength),
  })

/** Schema for POST /login */
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

/** Schema for POST /forgot-password */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
})

/** Schema for POST /reset-password */
export const resetPasswordSchema = (minPasswordLength = 8) =>
  z.object({
    token: z.string().min(1, 'Token is required'),
    password: passwordSchema(minPasswordLength),
  })

/** Schema for POST /verify-email */
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required'),
})

export type RegisterInput = z.infer<ReturnType<typeof registerSchema>>
export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<ReturnType<typeof resetPasswordSchema>>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
