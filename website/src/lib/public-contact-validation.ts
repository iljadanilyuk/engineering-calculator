export type PublicPhoneValidationResult =
  | {
      valid: true
      normalized: string
    }
  | {
      valid: false
      normalized?: undefined
    }

export function validatePublicContactPhone(rawPhone: string): PublicPhoneValidationResult {
  const trimmed = rawPhone.trim()
  if (!/^[+\d\s().-]{5,40}$/.test(trimmed)) return { valid: false }

  const digits = trimmed.replace(/\D/g, '')
  const normalizedDigits = normalizedPhoneDigits(digits)
  if (!normalizedDigits) return { valid: false }
  if (!/^(375\d{9}|7\d{10})$/.test(normalizedDigits)) return { valid: false }
  if (/^(\d)\1+$/.test(normalizedDigits) || hasLongRepeatedDigitRun(normalizedDigits)) {
    return { valid: false }
  }

  return { valid: true, normalized: `+${normalizedDigits}` }
}

export function maskPublicContactPhoneInput(input: HTMLInputElement | null) {
  if (!input) return

  const formatted = formatPublicContactPhoneInputValue(input.value)
  if (formatted !== input.value) input.value = formatted
}

export function formatPublicContactPhoneInputValue(raw: string) {
  const digits = raw.replace(/\D/g, '')

  const belarusDigits = phoneInputBelarusDigits(raw.trim(), digits)
  if (belarusDigits) return formatBelarusPhone(belarusDigits)

  const russianDigits = phoneInputRussianDigits(raw.trim(), digits)
  if (russianDigits) return formatRussianPhone(russianDigits)

  return raw
}

function phoneInputBelarusDigits(trimmed: string, digits: string) {
  if (trimmed.startsWith('+375')) {
    return digits.startsWith('375') ? digits : `375${digits.slice(0, 9)}`
  }

  if (digits.startsWith('00375')) return `375${digits.slice(5)}`
  if (digits.startsWith('375')) return digits
  if (digits.startsWith('80')) return `375${digits.slice(2)}`
  if (digits.startsWith('0') && isBelarusMobilePrefix(digits.slice(1, 3))) {
    return `375${digits.slice(1)}`
  }
  if (isBelarusMobilePrefix(digits.slice(0, 2))) return `375${digits}`

  return null
}

function phoneInputRussianDigits(trimmed: string, digits: string) {
  if (trimmed.startsWith('+7')) {
    return digits.startsWith('7') ? digits : `7${digits.slice(0, 10)}`
  }

  if (digits.startsWith('007')) return `7${digits.slice(3)}`
  if (digits.startsWith('7')) return digits

  return null
}

function normalizedPhoneDigits(digits: string) {
  if (digits.startsWith('00375') && digits.length === 14) return digits.slice(2)
  if (digits.startsWith('007') && digits.length === 13) return digits.slice(2)
  if (digits.startsWith('375') && digits.length === 12) return digits
  if (digits.startsWith('7') && digits.length === 11) return digits
  if (/^80\d{9}$/.test(digits)) return `375${digits.slice(2)}`
  if (/^0\d{9}$/.test(digits)) return `375${digits.slice(1)}`
  if (/^(25|29|33|44)\d{7}$/.test(digits)) return `375${digits}`
  return null
}

function hasLongRepeatedDigitRun(value: string) {
  return /(\d)\1{5,}/.test(value)
}

function isBelarusMobilePrefix(value: string) {
  return value === '25' || value === '29' || value === '33' || value === '44'
}

function formatBelarusPhone(digits: string) {
  const local = digits.replace(/^375/, '').slice(0, 9)
  let formatted = '+375'
  if (local.length > 0) formatted += ` ${local.slice(0, 2)}`
  if (local.length > 2) formatted += ` ${local.slice(2, 5)}`
  if (local.length > 5) formatted += `-${local.slice(5, 7)}`
  if (local.length > 7) formatted += `-${local.slice(7, 9)}`
  return formatted
}

function formatRussianPhone(digits: string) {
  const local = digits.replace(/^7/, '').slice(0, 10)
  let formatted = '+7'
  if (local.length > 0) formatted += ` ${local.slice(0, 3)}`
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`
  return formatted
}
