import {
  apiErrorSchema,
  authResponseSchema,
  blogPostCreateRequestSchema,
  blogPostListResponseSchema,
  blogPostResponseSchema,
  blogPostUpdateRequestSchema,
  calculationListQuerySchema,
  calculationListResponseSchema,
  calculationSaveResponseSchema,
  calculationUpdateRequestSchema,
  exchangeRateSettingResponseSchema,
  loginRequestSchema,
  logoutRequestSchema,
  meResponseSchema,
  projectExampleCreateRequestSchema,
  projectExampleListResponseSchema,
  projectExampleReorderRequestSchema,
  projectExampleRequestListQuerySchema,
  projectExampleRequestListResponseSchema,
  projectExampleResponseSchema,
  projectExampleUpdateRequestSchema,
  refreshRequestSchema,
  refreshResponseSchema,
  serviceCreateRequestSchema,
  serviceListResponseSchema,
  serviceReorderRequestSchema,
  serviceResponseSchema,
  serviceUpdateRequestSchema,
  type AuthResponse,
  type BlogPostCreateRequest,
  type BlogPostListResponse,
  type BlogPostResponse,
  type BlogPostUpdateRequest,
  type CalculationListQueryInput,
  type CalculationListResponse,
  type CalculationUpdateRequest,
  type CalculationRecord,
  type ExchangeRateSettingResponse,
  type LoginRequest,
  type LogoutRequest,
  type MeResponse,
  type ProjectExampleCreateRequest,
  type ProjectExampleListResponse,
  type ProjectExampleReorderRequest,
  type ProjectExampleRequestListQueryInput,
  type ProjectExampleRequestListResponse,
  type ProjectExampleResponse,
  type ProjectExampleUpdateRequest,
  type RefreshRequest,
  type RefreshResponse,
  type ServiceCreateRequest,
  type ServiceListResponse,
  type ServiceReorderRequest,
  type ServiceResponse,
  type ServiceUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'
import type { z } from 'zod'

const apiBaseUrl = (import.meta.env?.VITE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

type ApiClientOptions = {
  getAccessToken: () => string | null
  setAccessToken: (accessToken: string | null) => void
  onAuthExpired?: () => void | Promise<void>
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH'
  body?: unknown
  auth?: boolean
  retryOnUnauthorized?: boolean
  accessTokenOverride?: string
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export class ApiClient {
  private readonly options: ApiClientOptions
  private refreshPromise: Promise<RefreshResponse> | null = null

  constructor(options: ApiClientOptions) {
    this.options = options
  }

  login(input: LoginRequest): Promise<AuthResponse> {
    const payload = loginRequestSchema.parse(input)
    return this.request('/api/auth/login', authResponseSchema, {
      method: 'POST',
      body: payload,
      auth: false,
    })
  }

  refresh(input: RefreshRequest = {}): Promise<RefreshResponse> {
    const payload = refreshRequestSchema.parse(input)
    return this.request('/api/auth/refresh', refreshResponseSchema, {
      method: 'POST',
      body: payload,
      auth: false,
      retryOnUnauthorized: false,
    })
  }

  me(): Promise<MeResponse> {
    return this.request('/api/auth/me', meResponseSchema, {
      auth: true,
    })
  }

  listServices(): Promise<ServiceListResponse> {
    return this.request('/api/admin/services', serviceListResponseSchema, {
      auth: true,
    })
  }

  createService(input: ServiceCreateRequest): Promise<ServiceResponse> {
    const payload = serviceCreateRequestSchema.parse(input)
    return this.request('/api/admin/services', serviceResponseSchema, {
      method: 'POST',
      body: payload,
      auth: true,
    })
  }

  updateService(id: string, input: ServiceUpdateRequest): Promise<ServiceResponse> {
    const payload = serviceUpdateRequestSchema.parse(input)
    return this.request(`/api/admin/services/${id}`, serviceResponseSchema, {
      method: 'PATCH',
      body: payload,
      auth: true,
    })
  }

  reorderServices(input: ServiceReorderRequest): Promise<ServiceListResponse> {
    const payload = serviceReorderRequestSchema.parse(input)
    return this.request('/api/admin/services/reorder', serviceListResponseSchema, {
      method: 'PATCH',
      body: payload,
      auth: true,
    })
  }

  getExchangeRate(): Promise<ExchangeRateSettingResponse> {
    return this.request('/api/admin/settings/exchange-rate', exchangeRateSettingResponseSchema, {
      auth: true,
    })
  }

  listCalculations(input: CalculationListQueryInput = {}): Promise<CalculationListResponse> {
    const query = calculationListQuerySchema.parse(input)
    return this.request(`/api/admin/calculations${toQueryString(query)}`, calculationListResponseSchema, {
      auth: true,
    })
  }

  listProjectExampleRequests(
    input: ProjectExampleRequestListQueryInput = {},
  ): Promise<ProjectExampleRequestListResponse> {
    const query = projectExampleRequestListQuerySchema.parse(input)
    return this.request(
      `/api/admin/project-example-requests${toQueryString(query)}`,
      projectExampleRequestListResponseSchema,
      {
        auth: true,
      },
    )
  }

  listProjectExamples(): Promise<ProjectExampleListResponse> {
    return this.request('/api/admin/project-examples', projectExampleListResponseSchema, {
      auth: true,
    })
  }

  listBlogPosts(): Promise<BlogPostListResponse> {
    return this.request('/api/admin/blog-posts', blogPostListResponseSchema, {
      auth: true,
    })
  }

  createBlogPost(input: BlogPostCreateRequest): Promise<BlogPostResponse> {
    const payload = blogPostCreateRequestSchema.parse(input)
    return this.request('/api/admin/blog-posts', blogPostResponseSchema, {
      method: 'POST',
      body: payload,
      auth: true,
    })
  }

  updateBlogPost(id: string, input: BlogPostUpdateRequest): Promise<BlogPostResponse> {
    const payload = blogPostUpdateRequestSchema.parse(input)
    return this.request(`/api/admin/blog-posts/${id}`, blogPostResponseSchema, {
      method: 'PATCH',
      body: payload,
      auth: true,
    })
  }

  createProjectExample(input: ProjectExampleCreateRequest): Promise<ProjectExampleResponse> {
    const payload = projectExampleCreateRequestSchema.parse(input)
    return this.request('/api/admin/project-examples', projectExampleResponseSchema, {
      method: 'POST',
      body: payload,
      auth: true,
    })
  }

  updateProjectExample(id: string, input: ProjectExampleUpdateRequest): Promise<ProjectExampleResponse> {
    const payload = projectExampleUpdateRequestSchema.parse(input)
    return this.request(`/api/admin/project-examples/${id}`, projectExampleResponseSchema, {
      method: 'PATCH',
      body: payload,
      auth: true,
    })
  }

  reorderProjectExamples(input: ProjectExampleReorderRequest): Promise<ProjectExampleListResponse> {
    const payload = projectExampleReorderRequestSchema.parse(input)
    return this.request('/api/admin/project-examples/reorder', projectExampleListResponseSchema, {
      method: 'PATCH',
      body: payload,
      auth: true,
    })
  }

  getCalculation(id: string): Promise<{ calculation: CalculationRecord }> {
    return this.request(`/api/admin/calculations/${id}`, calculationSaveResponseSchema, {
      auth: true,
    })
  }

  updateCalculation(
    id: string,
    input: CalculationUpdateRequest,
  ): Promise<{ calculation: CalculationRecord }> {
    const payload = calculationUpdateRequestSchema.parse(input)
    return this.request(`/api/admin/calculations/${id}`, calculationSaveResponseSchema, {
      method: 'PATCH',
      body: payload,
      auth: true,
    })
  }

  async logout(input: LogoutRequest = {}) {
    const payload = logoutRequestSchema.parse(input)
    await this.rawRequest('/api/auth/logout', {
      method: 'POST',
      body: payload,
      auth: false,
      retryOnUnauthorized: false,
    })
  }

  async expireSession() {
    this.options.setAccessToken(null)
    await this.rawRequest('/api/auth/logout', {
      method: 'POST',
      body: {},
      auth: false,
      retryOnUnauthorized: false,
    }).catch(() => undefined)
    await this.options.onAuthExpired?.()
  }

  private async request<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: RequestOptions,
  ): Promise<z.infer<TSchema>> {
    const response = await this.rawRequest(path, options)
    const data = await response.json()
    return schema.parse(data)
  }

  private async rawRequest(path: string, options: RequestOptions): Promise<Response> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: this.headers(options),
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    if (response.status === 401 && options.auth && options.retryOnUnauthorized !== false) {
      const refreshed = await this.refreshOnce().catch(async (error: unknown) => {
        await this.expireSession()
        throw error
      })
      this.options.setAccessToken(refreshed.accessToken)
      return this.rawRequest(path, {
        ...options,
        accessTokenOverride: refreshed.accessToken,
        retryOnUnauthorized: false,
      })
    }

    if (!response.ok) {
      throw await toApiError(response)
    }

    return response
  }

  private refreshOnce() {
    this.refreshPromise ??= this.refresh().finally(() => {
      this.refreshPromise = null
    })

    return this.refreshPromise
  }

  private headers(options: RequestOptions) {
    const headers = new Headers({
      'X-Client-Platform': 'web',
    })

    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }

    if (options.auth) {
      const accessToken = options.accessTokenOverride ?? this.options.getAccessToken()
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`)
      }
    }

    return headers
  }
}

function toQueryString(input: Record<string, unknown>) {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }

  const queryString = params.toString()
  return queryString ? `?${queryString}` : ''
}

async function toApiError(response: Response) {
  const fallbackMessage = `Request failed with status ${response.status}`

  try {
    const parsed = apiErrorSchema.parse(await response.json())
    return new ApiRequestError(response.status, parsed.error.code, parsed.error.message)
  } catch {
    return new ApiRequestError(response.status, 'INTERNAL_ERROR', fallbackMessage)
  }
}
