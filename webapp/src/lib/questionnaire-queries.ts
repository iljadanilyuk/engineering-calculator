import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { QuestionnaireDefinitionEditRequest } from '@poznyak-engineering-calculator/contracts'

import type { ApiClient } from './api'

export const questionnaireQueryKeys = {
  definition: ['questionnaire-definition'] as const,
}

type QuestionnaireQueryOptions = {
  api: Pick<ApiClient, 'getQuestionnaireDefinition'>
  enabled: boolean
}

type QuestionnaireMutationOptions = {
  api: Pick<ApiClient, 'updateQuestionnaireDefinition'>
}

export function useQuestionnaireDefinitionQuery({
  api,
  enabled,
}: QuestionnaireQueryOptions) {
  return useQuery({
    queryKey: questionnaireQueryKeys.definition,
    enabled,
    queryFn: () => api.getQuestionnaireDefinition(),
  })
}

export function useUpdateQuestionnaireDefinitionMutation({
  api,
}: QuestionnaireMutationOptions) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: QuestionnaireDefinitionEditRequest) => api.updateQuestionnaireDefinition(input),
    onSuccess: (response) => {
      queryClient.setQueryData(questionnaireQueryKeys.definition, response)
    },
  })
}
