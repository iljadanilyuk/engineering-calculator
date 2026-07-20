export function isoToDateTimeLocalInputValue(value: string | null) {
  if (!value) return ''

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join('-')
    + `T${[
      padDatePart(date.getHours()),
      padDatePart(date.getMinutes()),
      padDatePart(date.getSeconds()),
    ].join(':')}`
}

export function dateTimeLocalInputToIso(
  value: string,
  originalIso?: string | null,
): { value: string | undefined } | { error: string } {
  const trimmed = value.trim()
  if (!trimmed) return { value: undefined }

  if (originalIso && isoToDateTimeLocalInputValue(originalIso) === trimmed) {
    return { value: originalIso }
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed)
  if (!match) return { error: 'Дата публикации должна быть корректной.' }

  const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)
  const hour = Number(hourRaw)
  const minute = Number(minuteRaw)
  const second = secondRaw ? Number(secondRaw) : 0
  const date = new Date(year, month - 1, day, hour, minute, second, 0)

  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
    || date.getHours() !== hour
    || date.getMinutes() !== minute
    || date.getSeconds() !== second
  ) {
    return { error: 'Дата публикации должна быть корректной.' }
  }

  return { value: date.toISOString() }
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}
