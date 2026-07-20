import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ProjectExampleCreateRequest,
  ProjectExampleReorderRequest,
  ProjectExampleUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'

import type { ApiClient } from './api'

export const projectCaseQueryKeys = {
  all: ['project-cases'] as const,
  list: () => [...projectCaseQueryKeys.all, 'list'] as const,
}

type ProjectCaseQueryOptions = {
  api: Pick<ApiClient, 'listProjectExamples'>
  enabled: boolean
}

type ProjectCaseMutationOptions = {
  api: Pick<ApiClient, 'createProjectExample' | 'updateProjectExample' | 'reorderProjectExamples'>
}

export function useProjectCasesQuery({ api, enabled }: ProjectCaseQueryOptions) {
  return useQuery({
    queryKey: projectCaseQueryKeys.list(),
    enabled,
    queryFn: () => api.listProjectExamples(),
  })
}

export function useCreateProjectCaseMutation({ api }: ProjectCaseMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProjectExampleCreateRequest) => api.createProjectExample(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectCaseQueryKeys.list() }),
  })
}

export function useUpdateProjectCaseMutation({ api }: ProjectCaseMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProjectExampleUpdateRequest }) =>
      api.updateProjectExample(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectCaseQueryKeys.list() }),
  })
}

export function useReorderProjectCasesMutation({ api }: ProjectCaseMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProjectExampleReorderRequest) => api.reorderProjectExamples(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectCaseQueryKeys.list() }),
  })
}
