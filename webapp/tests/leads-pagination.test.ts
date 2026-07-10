import { expect, test } from 'bun:test'

import { leadPageRange } from '../src/lib/leads-pagination'

test('leadPageRange reports rendered page bounds instead of treating all filtered rows as visible', () => {
  expect(leadPageRange({
    filteredCount: 150,
    limit: 100,
    offset: 0,
    renderedCount: 100,
  })).toEqual({
    start: 1,
    end: 100,
    canGoPrevious: false,
    canGoNext: true,
  })

  expect(leadPageRange({
    filteredCount: 150,
    limit: 100,
    offset: 100,
    renderedCount: 50,
  })).toEqual({
    start: 101,
    end: 150,
    canGoPrevious: true,
    canGoNext: false,
  })
})
