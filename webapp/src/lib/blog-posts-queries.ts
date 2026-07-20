import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BlogPostCreateRequest,
  BlogPostUpdateRequest,
} from '@poznyak-engineering-calculator/contracts'

import type { ApiClient } from './api'

export const blogPostQueryKeys = {
  all: ['blog-posts'] as const,
  list: () => [...blogPostQueryKeys.all, 'list'] as const,
}

type BlogPostQueryOptions = {
  api: Pick<ApiClient, 'listBlogPosts'>
  enabled: boolean
}

type BlogPostMutationOptions = {
  api: Pick<ApiClient, 'createBlogPost' | 'updateBlogPost'>
}

export function useBlogPostsQuery({ api, enabled }: BlogPostQueryOptions) {
  return useQuery({
    queryKey: blogPostQueryKeys.list(),
    enabled,
    queryFn: () => api.listBlogPosts(),
  })
}

export function useCreateBlogPostMutation({ api }: BlogPostMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: BlogPostCreateRequest) => api.createBlogPost(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: blogPostQueryKeys.list() }),
  })
}

export function useUpdateBlogPostMutation({ api }: BlogPostMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BlogPostUpdateRequest }) =>
      api.updateBlogPost(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: blogPostQueryKeys.list() }),
  })
}
