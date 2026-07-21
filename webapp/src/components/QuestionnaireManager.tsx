import {
  ArrowReloadHorizontalIcon,
  FloppyDiskIcon,
  GitBranchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  QuestionnaireDefinitionRecord,
  QuestionnaireDefinitionTextEdit,
  QuestionnaireQuestion,
  QuestionnaireSection,
  QuestionnaireVisibilityRule,
} from '@poznyak-engineering-calculator/contracts'
import { type FormEvent, useMemo, useState } from 'react'

import {
  AdminPageHeader,
  AdminPanel,
  ErrorBlock,
  LoadingBlock,
  MetricTile,
  StatusPill,
} from '@/components/AdminPrimitives'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { formatDateTime } from '@/lib/admin-derived'
import { ApiRequestError } from '@/lib/api'
import {
  useQuestionnaireDefinitionQuery,
  useUpdateQuestionnaireDefinitionMutation,
} from '@/lib/questionnaire-queries'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type SaveDefinitionEdit = (edit: QuestionnaireDefinitionTextEdit) => Promise<void>

export function QuestionnaireManager() {
  const auth = useAuth()
  const definitionQuery = useQuestionnaireDefinitionQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const updateDefinition = useUpdateQuestionnaireDefinitionMutation({ api: auth.api })
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const record = definitionQuery.data?.questionnaireDefinition ?? null
  const stats = useMemo(() => (record ? definitionStats(record) : null), [record])

  async function saveEdit(edit: QuestionnaireDefinitionTextEdit) {
    setActionError(null)
    setSavedMessage(null)

    try {
      await updateDefinition.mutateAsync({ edits: [edit] })
      setSavedMessage('Текст опросника сохранен')
    } catch (error) {
      setActionError(errorMessage(error))
      throw error
    }
  }

  if (definitionQuery.isLoading) {
    return <LoadingBlock label="Загружаем структуру опросника..." />
  }

  if (definitionQuery.isError) {
    return (
      <ErrorBlock
        title="Не удалось загрузить опросник"
        description={errorMessage(definitionQuery.error)}
        onRetry={() => void definitionQuery.refetch()}
      />
    )
  }

  if (!record || !stats) return null

  return (
    <section className="admin-view admin-questionnaire-page" aria-label="Конструктор опросника">
      <AdminPageHeader
        eyebrow="Настройка продукта"
        title="Конструктор опросника"
        description="Редактор опубликованной текстовой версии подробного опросника."
        actions={(
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={definitionQuery.isFetching}
            onClick={() => void definitionQuery.refetch()}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={2} data-icon="inline-start" />
            Обновить
          </Button>
        )}
      />

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось сохранить текст</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {savedMessage && (
        <Alert>
          <AlertTitle>{savedMessage}</AlertTitle>
          <AlertDescription>Новые анкеты будут получать обновленный snapshot версии.</AlertDescription>
        </Alert>
      )}

      <div className="admin-requirement-grid">
        <MetricTile label="Разделы" value={stats.sectionCount} tone="blue" />
        <MetricTile label="Вопросы" value={stats.questionCount} tone="green" />
        <MetricTile label="Варианты" value={stats.optionCount} tone="violet" />
        <MetricTile label="Версия" value={record.version} tone="gray" />
      </div>

      <AdminPanel
        title="Версия и источник"
        description={`${definitionStatusLabel(record.status)} · обновлено ${formatDefinitionDate(record.updatedAt)}`}
        action={<StatusPill tone={record.status === 'published' ? 'green' : 'gray'}>{definitionStatusLabel(record.status)}</StatusPill>}
      >
        <div className="admin-definition-meta-grid">
          <DefinitionMeta label="Источник" value={record.sourceBrief} />
          <DefinitionMeta label="Файл" value={record.sourceWorkbook} />
          <DefinitionMeta label="Лист" value={record.sourceWorksheet} />
          <DefinitionMeta label="Дата источника" value={record.sourceUpdatedAt} />
          <DefinitionMeta label="Hash" value={record.definitionHash} code />
          <DefinitionMeta label="Опубликовано" value={record.publishedAt ? formatDateTime(record.publishedAt) : 'Статическая версия'} />
        </div>
        <div className="admin-notice">
          <Typography variant="bodySmMedium">Политика источника</Typography>
          <Typography variant="bodySm" tone="muted">{record.sourcePolicy}</Typography>
        </div>
      </AdminPanel>

      <div className="admin-stack">
        {record.sections.map((section) => (
          <QuestionnaireSectionEditor
            key={`${record.definitionHash}-${section.id}`}
            section={section}
            definitionHash={record.definitionHash}
            isSaving={updateDefinition.isPending}
            onSave={saveEdit}
          />
        ))}
      </div>
    </section>
  )
}

function QuestionnaireSectionEditor({
  section,
  definitionHash,
  isSaving,
  onSave,
}: {
  section: QuestionnaireSection
  definitionHash: string
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const optionCount = section.questions.reduce((count, question) => count + (question.options?.length ?? 0), 0)

  return (
    <AdminPanel
      title={section.title}
      description={`${section.questions.length} вопросов · ${optionCount} вариантов · строки ${section.sourceRows.join(', ')}`}
      action={section.isLegacy ? <StatusPill tone="gray">Legacy</StatusPill> : undefined}
    >
      <div className="admin-questionnaire-section-grid">
        <SectionTitleEditor section={section} isSaving={isSaving} onSave={onSave} />
        <div className="admin-stack">
          {section.questions.map((question) => (
            <QuestionEditor
              key={`${definitionHash}-${question.id}`}
              question={question}
              isSaving={isSaving}
              onSave={onSave}
            />
          ))}
        </div>
      </div>
    </AdminPanel>
  )
}

function SectionTitleEditor({
  section,
  isSaving,
  onSave,
}: {
  section: QuestionnaireSection
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const [title, setTitle] = useState(section.title)
  const trimmedTitle = title.trim()
  const isDirty = trimmedTitle !== section.title

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedTitle || !isDirty) return
    await onSave({ target: 'section', sectionId: section.id, title: trimmedTitle })
  }

  return (
    <form className="admin-editor-card" onSubmit={(event) => void submit(event)}>
      <div className="admin-editor-card-head">
        <div>
          <Typography variant="bodySmMedium">Раздел</Typography>
          <Typography className="admin-code-line" variant="caption" tone="muted">{section.id}</Typography>
        </div>
        {section.isLegacy && <StatusPill tone="gray">Legacy</StatusPill>}
      </div>
      <Field>
        <FieldLabel htmlFor={`section-title-${section.id}`}>Название раздела</FieldLabel>
        <Input
          id={`section-title-${section.id}`}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
      </Field>
      <Button type="submit" size="sm" disabled={isSaving || !isDirty || !trimmedTitle}>
        <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
        Сохранить
      </Button>
    </form>
  )
}

function QuestionEditor({
  question,
  isSaving,
  onSave,
}: {
  question: QuestionnaireQuestion
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const [prompt, setPrompt] = useState(question.prompt)
  const trimmedPrompt = prompt.trim()
  const isDirty = trimmedPrompt !== question.prompt
  const options = question.options ?? []

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedPrompt || !isDirty) return
    await onSave({ target: 'question', questionId: question.id, prompt: trimmedPrompt })
  }

  return (
    <article className={cn('admin-editor-card', question.showIf && 'has-branch')}>
      <div className="admin-editor-card-head">
        <div className="admin-questionnaire-question-title">
          <Typography variant="bodySmMedium">Вопрос</Typography>
          <Typography className="admin-code-line" variant="caption" tone="muted">{question.id}</Typography>
        </div>
        <div className="admin-questionnaire-badges">
          <StatusPill tone="gray">Строка {question.sourceRow}</StatusPill>
          {question.isLegacy && <StatusPill tone="gray">Legacy</StatusPill>}
          {question.showIf && <StatusPill tone="violet">Ветка</StatusPill>}
        </div>
      </div>

      <form className="admin-questionnaire-text-form" onSubmit={(event) => void submit(event)}>
        <Field>
          <FieldLabel htmlFor={`question-prompt-${question.id}`}>Текст вопроса</FieldLabel>
          <Textarea
            id={`question-prompt-${question.id}`}
            value={prompt}
            rows={2}
            onChange={(event) => setPrompt(event.currentTarget.value)}
          />
        </Field>
        <Button type="submit" size="sm" disabled={isSaving || !isDirty || !trimmedPrompt}>
          <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
          Сохранить
        </Button>
      </form>

      <div className="admin-questionnaire-rule">
        <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} aria-hidden="true" />
        <Typography variant="caption" tone="muted">{visibilitySummary(question.showIf)}</Typography>
      </div>

      {options.length > 0 && (
        <div className="admin-questionnaire-options">
          {options.map((option) => (
            <OptionEditor
              key={`${question.id}-${option.id}`}
              questionId={question.id}
              option={option}
              isSaving={isSaving}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function OptionEditor({
  questionId,
  option,
  isSaving,
  onSave,
}: {
  questionId: string
  option: NonNullable<QuestionnaireQuestion['options']>[number]
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const [label, setLabel] = useState(option.label)
  const [hint, setHint] = useState(option.hint ?? '')
  const trimmedLabel = label.trim()
  const trimmedHint = hint.trim()
  const normalizedHint = trimmedHint || null
  const isDirty = trimmedLabel !== option.label || normalizedHint !== (option.hint ?? null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedLabel || !isDirty) return
    await onSave({
      target: 'option',
      questionId,
      optionId: option.id,
      label: trimmedLabel,
      hint: normalizedHint,
    })
  }

  return (
    <form className={cn('admin-questionnaire-option', option.showIf && 'has-branch')} onSubmit={(event) => void submit(event)}>
      <div className="admin-questionnaire-option-meta">
        <StatusPill tone="blue">Вариант</StatusPill>
        <Typography className="admin-code-line" variant="caption" tone="muted">{option.id}</Typography>
      </div>
      <FieldGroup className="admin-questionnaire-option-fields">
        <Field>
          <FieldLabel htmlFor={`option-label-${questionId}-${option.id}`}>Название варианта</FieldLabel>
          <Input
            id={`option-label-${questionId}-${option.id}`}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`option-hint-${questionId}-${option.id}`}>Подсказка</FieldLabel>
          <Input
            id={`option-hint-${questionId}-${option.id}`}
            value={hint}
            onChange={(event) => setHint(event.currentTarget.value)}
          />
        </Field>
      </FieldGroup>
      <div className="admin-questionnaire-option-footer">
        <Typography variant="caption" tone="muted">{visibilitySummary(option.showIf)}</Typography>
        <Button type="submit" size="sm" variant="outline" disabled={isSaving || !isDirty || !trimmedLabel}>
          <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
          Сохранить
        </Button>
      </div>
    </form>
  )
}

function DefinitionMeta({
  label,
  value,
  code = false,
}: {
  label: string
  value: string
  code?: boolean
}) {
  return (
    <div className="admin-definition-meta">
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography className={cn(code && 'admin-code-line')} variant="bodySmMedium">{value}</Typography>
    </div>
  )
}

function definitionStats(record: QuestionnaireDefinitionRecord) {
  return record.sections.reduce(
    (stats, section) => {
      stats.sectionCount += 1
      stats.questionCount += section.questions.length
      stats.optionCount += section.questions.reduce((count, question) => count + (question.options?.length ?? 0), 0)
      return stats
    },
    {
      sectionCount: 0,
      questionCount: 0,
      optionCount: 0,
    },
  )
}

function definitionStatusLabel(status: QuestionnaireDefinitionRecord['status']) {
  return status === 'published' ? 'Опубликована' : 'Резервная версия'
}

function formatDefinitionDate(value: string) {
  try {
    return formatDateTime(value)
  } catch {
    return value
  }
}

function visibilitySummary(rule: QuestionnaireVisibilityRule | undefined): string {
  if (!rule) return 'Всегда'
  if ('never' in rule) return 'Никогда'
  if ('all' in rule) return rule.all.map(visibilitySummary).join(' + ')
  if ('any' in rule) return rule.any.map(visibilitySummary).join(' / ')

  if (rule.exists) return `${rule.questionId}: заполнен`
  if (rule.equals?.length) return `${rule.questionId}: ${rule.equals.join(', ')}`
  if (rule.notEquals?.length) return `${rule.questionId}: не ${rule.notEquals.join(', ')}`
  return rule.questionId
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}
