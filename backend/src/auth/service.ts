import type {
  LoginRequest,
  UserRole,
  UserDto,
} from '@poznyak-engineering-calculator/contracts'

import type { DbClient } from '../db'
import type { AppEnv } from '../env'
import { AppError } from '../http/errors'
import type { AuthenticatedUserContext } from '../http/context'
import { userDtoFromAuthenticatedUser } from '../http/context'
import { signAccessToken, verifyAccessToken } from './access-tokens'
import { hashPassword, verifyPassword } from './passwords'
import { createRefreshToken, hashRefreshToken } from './refresh-tokens'

type SessionMetadata = {
  userAgent?: string
  ipAddress?: string
}

type UserRecord = {
  id: string
  email: string
  displayName: string | null
  role: UserRole
  createdAt: Date
}

type LoginRateLimitKeys = {
  emailKey: string
  clientKey: string
}

const loginEmailScope = 'login_email'
const loginClientScope = 'login_client'
const loginRateLimitWindowMs = 15 * 60 * 1_000
const maxLoginFailuresPerEmail = 5
const maxLoginFailuresPerClient = 20
const dummyPasswordHashPromise = hashPassword('not-a-real-user-password')

export class AuthService {
  constructor(
    private readonly db: DbClient,
    private readonly env: AppEnv,
  ) {}

  async login(input: LoginRequest, metadata: SessionMetadata) {
    const user = await this.db.user.findUnique({
      where: { email: input.email },
    })

    const passwordHash = user?.passwordHash ?? await dummyPasswordHashPromise
    const passwordMatches = await verifyPassword(input.password, passwordHash)
    if (!user || !passwordMatches) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password')
    }

    if (user.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'Admin access is required')
    }

    return this.issueSession(user, metadata)
  }

  async assertLoginAllowed(keys: LoginRateLimitKeys) {
    const now = new Date()
    await this.cleanupExpiredLoginBuckets(now)
    const buckets = await this.db.authRateLimitBucket.findMany({
      where: {
        OR: [
          { scope: loginEmailScope, bucketKey: keys.emailKey },
          { scope: loginClientScope, bucketKey: keys.clientKey },
        ],
      },
    })

    for (const bucket of buckets) {
      assertLoginBucketIsNotLimited(bucket, now)
    }
  }

  async recordLoginFailure(keys: LoginRateLimitKeys) {
    const now = new Date()
    const [emailBucket, clientBucket] = await Promise.all([
      this.incrementLoginFailureBucket(loginEmailScope, keys.emailKey, now),
      this.incrementLoginFailureBucket(loginClientScope, keys.clientKey, now),
    ])

    assertLoginBucketIsNotLimited(emailBucket, now)
    assertLoginBucketIsNotLimited(clientBucket, now)
  }

  async recordLoginSuccess(keys: LoginRateLimitKeys) {
    await this.db.authRateLimitBucket.deleteMany({
      where: {
        OR: [
          { scope: loginEmailScope, bucketKey: keys.emailKey },
          { scope: loginClientScope, bucketKey: keys.clientKey },
        ],
      },
    })
  }

  async refresh(refreshToken: string | undefined, metadata: SessionMetadata) {
    if (!refreshToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token is required')
    }

    const refreshTokenHash = hashRefreshToken(refreshToken)
    const now = new Date()
    const currentSession = await this.db.authSession.findFirst({
      where: {
        refreshTokenHash,
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },
      include: {
        user: true,
      },
    })

    if (!currentSession) {
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh session is invalid or expired')
    }

    const nextRefreshToken = createRefreshToken()
    const nextRefreshTokenHash = hashRefreshToken(nextRefreshToken)
    const expiresAt = this.refreshExpiresAt()

    const nextSession = await this.db.$transaction(async (tx) => {
      const revokeResult = await tx.authSession.updateMany({
        where: {
          id: currentSession.id,
          revokedAt: null,
          expiresAt: {
            gt: now,
          },
        },
        data: { revokedAt: now },
      })

      if (revokeResult.count !== 1) {
        throw new AppError(401, 'UNAUTHORIZED', 'Refresh session is invalid or expired')
      }

      return tx.authSession.create({
        data: {
          userId: currentSession.userId,
          refreshTokenHash: nextRefreshTokenHash,
          expiresAt,
          userAgent: metadata.userAgent,
          ipAddress: metadata.ipAddress,
        },
      })
    })

    const accessToken = await signAccessToken(
      {
        sub: currentSession.user.id,
        email: currentSession.user.email,
        sessionId: nextSession.id,
      },
      this.env,
    )

    return {
      accessToken,
      refreshToken: nextRefreshToken,
    }
  }

  async authenticateAccessToken(accessToken: string | undefined): Promise<AuthenticatedUserContext> {
    if (!accessToken) {
      throw new AppError(401, 'UNAUTHORIZED', 'Access token is required')
    }

    const payload = await verifyAccessToken(accessToken, this.env).catch(() => {
      throw new AppError(401, 'UNAUTHORIZED', 'Access token is invalid or expired')
    })

    const session = await this.db.authSession.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    })

    if (!session) {
      throw new AppError(401, 'UNAUTHORIZED', 'Session is invalid or expired')
    }

    return {
      ...toUserDto(session.user),
      sessionId: session.id,
    }
  }

  async getMe(accessToken: string | undefined) {
    const user = await this.authenticateAccessToken(accessToken)

    return {
      user: userDtoFromAuthenticatedUser(user),
    }
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return

    await this.db.authSession.updateMany({
      where: {
        refreshTokenHash: hashRefreshToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    })
  }

  private async issueSession(user: UserRecord, metadata: SessionMetadata) {
    const refreshToken = createRefreshToken()
    const session = await this.db.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: this.refreshExpiresAt(),
        userAgent: metadata.userAgent,
        ipAddress: metadata.ipAddress,
      },
    })

    const accessToken = await signAccessToken(
      {
        sub: user.id,
        email: user.email,
        sessionId: session.id,
      },
      this.env,
    )

    return {
      user: toUserDto(user),
      accessToken,
      refreshToken,
    }
  }

  private refreshExpiresAt() {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000)
  }

  private async incrementLoginFailureBucket(scope: string, bucketKey: string, now: Date) {
    const windowCutoff = new Date(now.getTime() - loginRateLimitWindowMs)
    const [bucket] = await this.db.$queryRaw<
      Array<{ scope: string; failedCount: number; windowStartedAt: Date }>
    >`
      INSERT INTO "auth_rate_limit_buckets" (
        "scope",
        "bucket_key",
        "failed_count",
        "window_started_at",
        "updated_at"
      )
      VALUES (${scope}, ${bucketKey}, 1, ${now}, ${now})
      ON CONFLICT ("scope", "bucket_key")
      DO UPDATE SET
        "failed_count" = CASE
          WHEN "auth_rate_limit_buckets"."window_started_at" <= ${windowCutoff} THEN 1
          ELSE "auth_rate_limit_buckets"."failed_count" + 1
        END,
        "window_started_at" = CASE
          WHEN "auth_rate_limit_buckets"."window_started_at" <= ${windowCutoff} THEN ${now}
          ELSE "auth_rate_limit_buckets"."window_started_at"
        END,
        "updated_at" = ${now}
      RETURNING
        "scope",
        "failed_count" AS "failedCount",
        "window_started_at" AS "windowStartedAt"
    `

    if (!bucket) {
      throw new AppError(500, 'INTERNAL_ERROR', 'Could not update login rate limit bucket')
    }

    return bucket
  }

  private cleanupExpiredLoginBuckets(now: Date) {
    return this.db.authRateLimitBucket.deleteMany({
      where: {
        windowStartedAt: {
          lt: new Date(now.getTime() - loginRateLimitWindowMs),
        },
      },
    })
  }
}

function assertLoginBucketIsNotLimited(
  bucket: { scope: string; failedCount: number; windowStartedAt: Date },
  now: Date,
) {
  if (now.getTime() - bucket.windowStartedAt.getTime() >= loginRateLimitWindowMs) return

  const maxFailures =
    bucket.scope === loginEmailScope ? maxLoginFailuresPerEmail : maxLoginFailuresPerClient

  if (bucket.failedCount <= maxFailures) return

  throw new AppError(429, 'RATE_LIMITED', 'Too many failed login attempts. Please try again later.')
}

export function toUserDto(user: UserRecord): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  }
}
