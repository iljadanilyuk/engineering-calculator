import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ServiceCreateRequest,
  ServiceReorderRequest,
  ServiceUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'

import type { ApiClient } from './api'

export const serviceQueryKeys = {
  all: ['services'] as const,
  list: () => [...serviceQueryKeys.all, 'list'] as const,
  exchangeRate: () => [...serviceQueryKeys.all, 'exchange-rate'] as const,
}

type ServiceQueryOptions = {
  api: Pick<ApiClient, 'listServices' | 'getExchangeRate'>
  enabled: boolean
}

type ServiceMutationOptions = {
  api: Pick<ApiClient, 'createService' | 'updateService' | 'reorderServices'>
}

export function useServicesQuery({ api, enabled }: ServiceQueryOptions) {
  return useQuery({
    queryKey: serviceQueryKeys.list(),
    enabled,
    queryFn: () => api.listServices(),
  })
}

export function useExchangeRateQuery({ api, enabled }: ServiceQueryOptions) {
  return useQuery({
    queryKey: serviceQueryKeys.exchangeRate(),
    enabled,
    queryFn: () => api.getExchangeRate(),
  })
}

export function useCreateServiceMutation({ api }: ServiceMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ServiceCreateRequest) => api.createService(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serviceQueryKeys.list() }),
  })
}

export function useUpdateServiceMutation({ api }: ServiceMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ServiceUpdateRequest }) =>
      api.updateService(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serviceQueryKeys.list() }),
  })
}

export function useReorderServicesMutation({ api }: ServiceMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ServiceReorderRequest) => api.reorderServices(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: serviceQueryKeys.list() }),
  })
}
