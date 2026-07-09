import { createContext } from 'react'
import type { LoginRequest, UserDto } from '@poznyak-engineering-calculator/contracts'

import type { ApiClient } from './api'

export type AuthContextValue = {
  user: UserDto | null
  isBootstrapping: boolean
  isAuthenticated: boolean
  api: ApiClient
  login: (input: LoginRequest) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
