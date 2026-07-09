import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().email().max(254)

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')

export const userRoleSchema = z.enum(['admin', 'member'])

export const userSchema = z.object({
  id: z.string(),
  email: emailSchema,
  displayName: z.string().nullable(),
  role: userRoleSchema,
  createdAt: z.string().datetime(),
})

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(32).optional(),
  })
  .optional()
  .default({})

export const logoutRequestSchema = z
  .object({
    refreshToken: z.string().min(32).optional(),
  })
  .optional()
  .default({})

export const authResponseSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

export const refreshResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
})

export const meResponseSchema = z.object({
  user: userSchema,
})

export type UserRole = z.infer<typeof userRoleSchema>
export type UserDto = z.infer<typeof userSchema>
export type LoginRequest = z.infer<typeof loginRequestSchema>
export type RefreshRequest = z.infer<typeof refreshRequestSchema>
export type LogoutRequest = z.infer<typeof logoutRequestSchema>
export type AuthResponse = z.infer<typeof authResponseSchema>
export type RefreshResponse = z.infer<typeof refreshResponseSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
