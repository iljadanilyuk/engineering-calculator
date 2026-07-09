import {
  emailSchema,
  passwordSchema,
} from '@poznyak-engineering-calculator/contracts'

import { hashPassword } from '../src/auth/passwords'
import type { DbClient } from '../src/db'
import { createBackendRuntime } from '../src/runtime'

const skipIfExists = Bun.env.ADMIN_CREATE_SKIP_IF_EXISTS === 'true'
const allowAdditionalAdmin = Bun.env.ADMIN_CREATE_ALLOW_ADDITIONAL === 'true'

type CreateAdminUserInput = {
  email: string
  password: string
  displayName: string | null
}

type CreateAdminUserOptions = {
  skipIfExists?: boolean
  allowAdditionalAdmin?: boolean
}

async function main() {
  const input = parseAdminInput()
  const runtime = createBackendRuntime()

  try {
    const result = await createAdminUser(runtime.prisma, input, {
      skipIfExists,
      allowAdditionalAdmin,
    })

    if (result.created) {
      console.log(`Created admin user: ${result.email}`)
    } else {
      console.log(`Admin user already exists: ${result.email}`)
    }
  } finally {
    await runtime.close()
  }
}

export async function createAdminUser(
  prisma: DbClient,
  input: CreateAdminUserInput,
  options: CreateAdminUserOptions = {},
) {
  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { email: true, role: true },
  })

  if (existingUser) {
    if (options.skipIfExists && existingUser.role === 'admin') {
      return {
        created: false,
        email: existingUser.email,
      }
    }

    throw new Error('A user with this email already exists. Refusing to create or overwrite it.')
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin' },
    select: { email: true },
  })

  if (existingAdmin && !options.allowAdditionalAdmin) {
    throw new Error('An admin user already exists. Refusing to create or overwrite another admin.')
  }

  const passwordHash = await hashPassword(input.password)
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      role: 'admin',
    },
    select: {
      email: true,
    },
  })

  return {
    created: true,
    email: user.email,
  }
}

function parseAdminInput() {
  const email = emailSchema.parse(requiredEnv('ADMIN_EMAIL'))
  const password = passwordSchema.parse(requiredEnv('ADMIN_PASSWORD'))
  const displayName = normalizeDisplayName(Bun.env.ADMIN_DISPLAY_NAME)

  return {
    email,
    password,
    displayName,
  }
}

function requiredEnv(name: string) {
  const value = Bun.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

function normalizeDisplayName(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new Error('ADMIN_DISPLAY_NAME must be between 2 and 80 characters when provided')
  }

  return trimmed
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
