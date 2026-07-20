import { expect, test } from 'bun:test'

import {
  dateTimeLocalInputToIso,
  isoToDateTimeLocalInputValue,
} from '../src/lib/blog-post-time'

test('blog post publishedAt helpers preserve the same instant on unchanged edit', () => {
  const originalIso = '2026-07-20T08:00:31.789Z'
  const inputValue = isoToDateTimeLocalInputValue(originalIso)

  expect(inputValue).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/)
  expect(dateTimeLocalInputToIso(inputValue, originalIso)).toEqual({
    value: originalIso,
  })
})

test('blog post publishedAt helpers parse local datetime values without UTC/local drift', () => {
  const originalIso = '2026-07-20T08:00:00.000Z'
  const inputValue = isoToDateTimeLocalInputValue(originalIso)
  const parsed = dateTimeLocalInputToIso(inputValue)

  expect(parsed).toEqual({
    value: originalIso,
  })
})

test('blog post publishedAt helpers reject invalid calendar dates', () => {
  expect(dateTimeLocalInputToIso('2026-02-31T10:00:00')).toEqual({
    error: 'Дата публикации должна быть корректной.',
  })
})
