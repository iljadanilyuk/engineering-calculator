import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CalculationListQueryInput,
  CalculationUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'

import type { ApiClient } from './api'

export type LeadListFilters = CalculationListQueryInput

export const leadQueryKeys = {
  all: ['leads'] as const,
  list: (filters: LeadListFilters) => [...leadQueryKeys.all, 'list', filters] as const,
  detail: (id: string) => [...leadQueryKeys.all, 'detail', id] as const,
  exampleRequests: (limit: number) => [...leadQueryKeys.all, 'project-example-requests', limit] as const,
}

type LeadQueryOptions = {
  api: Pick<ApiClient, 'listCalculations' | 'getCalculation'>
  enabled: boolean
}

type ProjectExampleRequestQueryOptions = {
  api: Pick<ApiClient, 'listProjectExampleRequests'>
  enabled: boolean
}

type LeadMutationOptions = {
  api: Pick<ApiClient, 'updateCalculation'>
}

export function useLeadsQuery({
  api,
  enabled,
  filters,
}: LeadQueryOptions & { filters: LeadListFilters }) {
  return useQuery({
    queryKey: leadQueryKeys.list(filters),
    enabled,
    queryFn: () => api.listCalculations(filters),
  })
}

export function useLeadQuery({
  api,
  enabled,
  id,
}: LeadQueryOptions & { id: string }) {
  return useQuery({
    queryKey: leadQueryKeys.detail(id),
    enabled: enabled && Boolean(id),
    queryFn: () => api.getCalculation(id),
  })
}

export function useProjectExampleRequestsQuery({
  api,
  enabled,
  limit = 25,
}: ProjectExampleRequestQueryOptions & { limit?: number }) {
  return useQuery({
    queryKey: leadQueryKeys.exampleRequests(limit),
    enabled,
    queryFn: () => api.listProjectExampleRequests({ limit, offset: 0 }),
  })
}

export function useUpdateLeadMutation({ api }: LeadMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CalculationUpdateRequest }) =>
      api.updateCalculation(id, input),
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: leadQueryKeys.all })
      queryClient.setQueryData(leadQueryKeys.detail(response.calculation.id), response)
    },
  })
}
