import type { UserDto } from '@poznyak-engineering-calculator/contracts'

import type { AppEnv } from '../env'
import type { AuthService } from '../auth/service'
import type { StorageService } from '../storage/service'

export type AuthenticatedUserContext = UserDto & {
  sessionId: string
}

export type AppHonoVariables = {
  authService: AuthService
  env: AppEnv
  storageService: StorageService | null
}

export type AppHonoEnv = {
  Variables: AppHonoVariables
}

export type AuthenticatedHonoEnv = {
  Variables: AppHonoVariables & {
    user: AuthenticatedUserContext
  }
}

export function userDtoFromAuthenticatedUser(user: AuthenticatedUserContext): UserDto {
  const { sessionId: _sessionId, ...dto } = user
  return dto
}
