import { useForm } from '@tanstack/react-form'
import {
  loginRequestSchema,
  type LoginRequest,
} from '@poznyak-engineering-calculator/contracts'
import type { z } from 'zod'
import { useId, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiRequestError } from '@/lib/api'
import { useAuth } from '@/lib/use-auth'

type FieldName = 'email' | 'password'
type FormError = { message?: string }
type FieldErrors = Partial<Record<FieldName, FormError[]>>

export function AuthForm() {
  const auth = useAuth()
  const emailId = useId()
  const emailErrorId = useId()
  const passwordId = useId()
  const passwordErrorId = useId()
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    onSubmit: async ({ value }) => {
      setFormError(null)

      const result = loginRequestSchema.safeParse(value)
      if (!result.success) {
        setFieldErrors(toFieldErrors(result.error.issues))
        return
      }

      setFieldErrors({})

      try {
        await auth.login(result.data as LoginRequest)
      } catch (caughtError) {
        if (caughtError instanceof ApiRequestError) {
          setFormError(errorMessageForRequest(caughtError))
          return
        }
        setFormError('Неожиданная ошибка авторизации')
      }
    },
  })

  return (
    <Card className="w-full" aria-label="Вход администратора">
      <CardHeader>
        <CardTitle>Вход в админ-панель</CardTitle>
        <CardDescription>
          Используйте учетную запись администратора, созданную при настройке проекта.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <FieldGroup className="gap-4">
            <form.Field
              name="email"
              children={(field) => (
                <Field data-invalid={hasErrors(fieldErrors.email)}>
                  <FieldLabel htmlFor={emailId}>Эл. почта</FieldLabel>
                  <Input
                    id={emailId}
                    name={field.name}
                    value={field.state.value}
                    type="text"
                    inputMode="email"
                    autoComplete="email"
                    aria-invalid={hasErrors(fieldErrors.email)}
                    aria-describedby={errorId(fieldErrors.email, emailErrorId)}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearFieldError('email', setFieldErrors)
                      setFormError(null)
                    }}
                  />
                  <FieldError id={emailErrorId} errors={fieldErrors.email} />
                </Field>
              )}
            />

            <form.Field
              name="password"
              children={(field) => (
                <Field data-invalid={hasErrors(fieldErrors.password)}>
                  <FieldLabel htmlFor={passwordId}>Пароль</FieldLabel>
                  <Input
                    id={passwordId}
                    name={field.name}
                    value={field.state.value}
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={hasErrors(fieldErrors.password)}
                    aria-describedby={errorId(fieldErrors.password, passwordErrorId)}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      clearFieldError('password', setFieldErrors)
                      setFormError(null)
                    }}
                  />
                  <FieldError id={passwordErrorId} errors={fieldErrors.password} />
                </Field>
              )}
            />

            <FormAlert message={formError} />

            <form.Subscribe
              selector={(state) => state.isSubmitting}
              children={(isSubmitting) => (
                <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Входим...' : 'Войти'}
                </Button>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <Alert variant="destructive">
      <AlertTitle>Не удалось войти</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

function errorMessageForRequest(error: ApiRequestError) {
  if (error.status === 429) {
    return 'Слишком много попыток входа. Попробуйте позже.'
  }

  if (error.status === 403) {
    return 'У этой учетной записи нет прав администратора.'
  }

  if (error.status === 401 || error.message === 'Invalid email or password') {
    return 'Неверная почта или пароль'
  }

  return error.message
}

function toFieldErrors(issues: z.ZodIssue[]): FieldErrors {
  return issues.reduce<FieldErrors>((errors, issue) => {
    const field = issue.path[0]
    if (!isFieldName(field)) return errors

    errors[field] = [...(errors[field] ?? []), { message: localizedFieldError(issue.message) }]
    return errors
  }, {})
}

function clearFieldError(
  field: FieldName,
  setFieldErrors: (updater: (errors: FieldErrors) => FieldErrors) => void,
) {
  setFieldErrors((currentErrors) => {
    if (!currentErrors[field]?.length) return currentErrors
    const nextErrors = { ...currentErrors }
    delete nextErrors[field]
    return nextErrors
  })
}

function hasErrors(errors: FormError[] | undefined) {
  return Boolean(errors?.length)
}

function errorId(errors: FormError[] | undefined, id: string) {
  return hasErrors(errors) ? id : undefined
}

function isFieldName(field: unknown): field is FieldName {
  return field === 'email' || field === 'password'
}

function localizedFieldError(message: string) {
  if (message === 'Invalid email address') return 'Введите корректную эл. почту'
  if (message === 'Password must be at least 8 characters') {
    return 'Пароль должен быть не короче 8 символов'
  }

  return message
}
