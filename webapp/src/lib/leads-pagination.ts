export type LeadPageSummaryInput = {
  filteredCount: number
  limit: number
  offset: number
  renderedCount: number
}

export function leadPageRange(input: LeadPageSummaryInput) {
  const start = input.filteredCount > 0 ? input.offset + 1 : 0
  const end = Math.min(input.offset + input.renderedCount, input.filteredCount)

  return {
    start,
    end,
    canGoPrevious: input.offset > 0,
    canGoNext: input.offset + input.limit < input.filteredCount,
  }
}
