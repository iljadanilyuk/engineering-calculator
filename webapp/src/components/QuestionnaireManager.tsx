import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  ArrowUp01Icon,
  FileViewIcon,
  FloppyDiskIcon,
  GitBranchIcon,
  Image01Icon,
  MoreVerticalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  QuestionnaireDefinitionRecord,
  QuestionnaireDefinitionTextEdit,
  QuestionnaireOption,
  QuestionnaireQuestion,
  QuestionnaireSection,
  QuestionnaireVisibilityRule,
} from '@poznyak-engineering-calculator/contracts'
import { type FormEvent, useMemo, useState } from 'react'

import {
  ErrorBlock,
  LoadingBlock,
  StatusPill,
} from '@/components/AdminPrimitives'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
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
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null)
  const record = definitionQuery.data?.questionnaireDefinition ?? null
  const stats = useMemo(() => (record ? definitionStats(record) : null), [record])
  const selectedSection = useMemo(() => {
    if (!record) return null
    return record.sections.find((section) => section.id === selectedSectionId) ?? record.sections[0] ?? null
  }, [record, selectedSectionId])
  const selectedQuestion = useMemo(() => {
    if (!selectedSection) return null
    return selectedSection.questions.find((question) => question.id === selectedQuestionId)
      ?? selectedSection.questions[0]
      ?? null
  }, [selectedQuestionId, selectedSection])
  const isSaving = updateDefinition.isPending

  async function saveEdit(edit: QuestionnaireDefinitionTextEdit) {
    setActionError(null)
    setSavedMessage(null)

    try {
      if (!record) return
      await updateDefinition.mutateAsync({ baseDefinitionHash: record.definitionHash, edits: [edit] })
      setSavedMessage('Изменения сохранены и опубликованы')
    } catch (error) {
      setActionError(errorMessage(error))
      throw error
    }
  }

  async function moveSection(sectionId: string, direction: MoveDirection) {
    if (!record) return
    const sectionIds = moveId(record.sections.map((section) => section.id), sectionId, direction)
    if (!sectionIds) return
    await saveEdit({ target: 'section_order', sectionIds })
  }

  async function moveQuestion(section: QuestionnaireSection, questionId: string, direction: MoveDirection) {
    const questionIds = moveId(section.questions.map((question) => question.id), questionId, direction)
    if (!questionIds) return
    await saveEdit({ target: 'question_order', sectionId: section.id, questionIds })
  }

  async function moveOption(question: QuestionnaireQuestion, optionId: string, direction: MoveDirection) {
    const optionIds = moveId((question.options ?? []).map((option) => option.id), optionId, direction)
    if (!optionIds) return
    await saveEdit({ target: 'option_order', questionId: question.id, optionIds })
  }

  function selectSection(section: QuestionnaireSection) {
    setSelectedSectionId(section.id)
    setSelectedQuestionId(section.questions[0]?.id ?? null)
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

  if (!record || !stats || !selectedSection) return null

  return (
    <section className="admin-view admin-questionnaire-builder-page" aria-label="Конструктор опросника">
      <div className="admin-questionnaire-builder-top">
        <div className="admin-questionnaire-crumbs">
          <Typography variant="caption" tone="muted">Опросные листы</Typography>
          <span aria-hidden="true">/</span>
          <Typography variant="bodySmMedium">Опросник: Отопление частного дома</Typography>
        </div>
        <div className="admin-questionnaire-toolbar">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.open('/questionnaire/', '_blank', 'noopener,noreferrer')}
          >
            <HugeiconsIcon icon={FileViewIcon} strokeWidth={2} data-icon="inline-start" />
            Предпросмотр
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Обновить структуру"
            disabled={definitionQuery.isFetching}
            onClick={() => void definitionQuery.refetch()}
          >
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} strokeWidth={2} />
          </Button>
          <Button type="button" size="sm" disabled>
            <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
            {isSaving ? 'Сохраняем' : 'Сохранено'}
          </Button>
        </div>
      </div>

      <div className="admin-questionnaire-tabs" role="tablist" aria-label="Разделы конструктора">
        <button className="admin-questionnaire-tab is-active" type="button" role="tab" aria-selected="true">
          Структура
        </button>
        <button className="admin-questionnaire-tab" type="button" role="tab" aria-selected="false" disabled>
          Логика (ветвления)
        </button>
        <button className="admin-questionnaire-tab" type="button" role="tab" aria-selected="false" disabled>
          Настройки
        </button>
        <button className="admin-questionnaire-tab" type="button" role="tab" aria-selected="false" disabled>
          Публикация
        </button>
      </div>

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось сохранить изменения</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {savedMessage && (
        <Alert>
          <AlertTitle>{savedMessage}</AlertTitle>
          <AlertDescription>Новые анкеты получат новый snapshot версии. Старые заявки останутся на своей версии.</AlertDescription>
        </Alert>
      )}

      <div className="admin-questionnaire-builder" data-busy={isSaving ? 'true' : 'false'}>
        <aside className="admin-qb-panel admin-qb-sections" aria-label="Структура опросника">
          <div className="admin-qb-panel-head">
            <div>
              <Typography variant="caption" tone="muted">Структура опросника</Typography>
              <Typography variant="bodySmMedium">{stats.sectionCount} разделов · {stats.questionCount} вопросов</Typography>
            </div>
            <StatusPill tone={record.status === 'published' ? 'green' : 'gray'}>{definitionStatusLabel(record.status)}</StatusPill>
          </div>

          <div className="admin-qb-action-row">
            <Button type="button" variant="outline" size="sm" disabled title="Добавление разделов будет отдельной версией опросника">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Добавить раздел
            </Button>
            <Button type="button" variant="outline" size="sm" disabled title="Добавление вопросов будет отдельной версией опросника">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Добавить вопрос
            </Button>
          </div>

          <div className="admin-qb-section-list">
            {record.sections.map((section, index) => (
              <SectionCard
                key={section.id}
                section={section}
                index={index}
                isSelected={section.id === selectedSection.id}
                isSaving={isSaving}
                canMoveUp={index > 0}
                canMoveDown={index < record.sections.length - 1}
                onSelect={() => selectSection(section)}
                onMoveUp={() => void moveSection(section.id, 'up')}
                onMoveDown={() => void moveSection(section.id, 'down')}
                onToggle={(checked) => void saveEdit({ target: 'section', sectionId: section.id, isEnabled: checked })}
              />
            ))}
          </div>

          <div className="admin-qb-dropzone" aria-disabled="true">
            <Typography variant="caption" tone="muted">Перемещайте разделы кнопками порядка</Typography>
          </div>

          <SelectedSectionTitleEditor
            key={`${record.definitionHash}-${selectedSection.id}`}
            section={selectedSection}
            isSaving={isSaving}
            onSave={saveEdit}
          />
        </aside>

        <main className="admin-qb-panel admin-qb-questions" aria-label={`Вопросы раздела ${selectedSection.title}`}>
          <div className="admin-qb-panel-head">
            <div>
              <Typography variant="bodySmMedium">{sectionIndexLabel(record.sections, selectedSection)} {selectedSection.title}</Typography>
              <Typography variant="caption" tone="muted">
                {enabledCount(selectedSection.questions)} активных из {selectedSection.questions.length}
              </Typography>
            </div>
            <div className="admin-qb-icon-stack" aria-label="Инструменты раздела">
              <Button type="button" variant="ghost" size="icon-xs" disabled title="Поиск появится в расширенном редакторе">
                <span className="admin-qb-search-dot" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon-xs" disabled title="Групповой режим будет отдельной версией">
                <HugeiconsIcon icon={MoreVerticalIcon} strokeWidth={2} />
              </Button>
            </div>
          </div>

          <div className="admin-qb-question-list">
            {selectedSection.questions.map((question, index) => (
              <QuestionCard
                key={question.id}
                question={question}
                index={index}
                sectionIndex={record.sections.findIndex((section) => section.id === selectedSection.id)}
                isSelected={question.id === selectedQuestion?.id}
                isSaving={isSaving}
                canMoveUp={index > 0}
                canMoveDown={index < selectedSection.questions.length - 1}
                onSelect={() => setSelectedQuestionId(question.id)}
                onMoveUp={() => void moveQuestion(selectedSection, question.id, 'up')}
                onMoveDown={() => void moveQuestion(selectedSection, question.id, 'down')}
                onToggle={(checked) => void saveEdit({ target: 'question', questionId: question.id, isEnabled: checked })}
              />
            ))}
          </div>

          <div className="admin-qb-dropzone" aria-disabled="true">
            <Typography variant="caption" tone="muted">Перемещайте вопросы кнопками порядка</Typography>
          </div>

          <Button type="button" variant="ghost" size="sm" disabled title="Новые вопросы требуют версии и миграции ветвлений">
            <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
            Добавить вопрос
          </Button>
        </main>

        <QuestionInspector
          key={selectedQuestion ? `${record.definitionHash}-${selectedQuestion.id}` : 'empty'}
          record={record}
          section={selectedSection}
          question={selectedQuestion}
          isSaving={isSaving}
          onSave={saveEdit}
          onToggleQuestion={(checked) => selectedQuestion
            ? void saveEdit({ target: 'question', questionId: selectedQuestion.id, isEnabled: checked })
            : undefined}
          onMoveOption={moveOption}
          stats={stats}
        />
      </div>
    </section>
  )
}

function SectionCard({
  section,
  index,
  isSelected,
  isSaving,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onToggle,
}: {
  section: QuestionnaireSection
  index: number
  isSelected: boolean
  isSaving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: (checked: boolean) => void
}) {
  const isEnabled = itemIsEnabled(section)

  return (
    <article className={cn('admin-qb-section-card', isSelected && 'is-active', !isEnabled && 'is-disabled')}>
      <button className="admin-qb-card-main" type="button" onClick={onSelect}>
        <DragHandle />
        <span className="admin-qb-card-copy">
          <Typography variant="bodySmMedium">{index + 1}. {section.title}</Typography>
          <Typography variant="caption" tone="muted">{section.questions.length} вопросов</Typography>
        </span>
      </button>
      <div className="admin-qb-card-actions">
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Поднять раздел ${section.title}`} disabled={isSaving || !canMoveUp} onClick={onMoveUp}>
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Опустить раздел ${section.title}`} disabled={isSaving || !canMoveDown} onClick={onMoveDown}>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
        </Button>
        <Switch
          aria-label={`${isEnabled ? 'Отключить' : 'Включить'} раздел ${section.title}`}
          checked={isEnabled}
          disabled={isSaving}
          onCheckedChange={onToggle}
          size="sm"
        />
      </div>
    </article>
  )
}

function QuestionCard({
  question,
  index,
  sectionIndex,
  isSelected,
  isSaving,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMoveUp,
  onMoveDown,
  onToggle,
}: {
  question: QuestionnaireQuestion
  index: number
  sectionIndex: number
  isSelected: boolean
  isSaving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: (checked: boolean) => void
}) {
  const isEnabled = itemIsEnabled(question)

  return (
    <article className={cn('admin-qb-question-card', isSelected && 'is-active', !isEnabled && 'is-disabled')}>
      <button className="admin-qb-card-main" type="button" onClick={onSelect}>
        <DragHandle />
        <span className="admin-qb-card-copy">
          <Typography variant="bodySmMedium">{sectionIndex + 1}.{index + 1} {question.prompt}</Typography>
          <span className="admin-qb-card-meta">
            <StatusPill tone="gray">{questionTypeLabel(question)}</StatusPill>
            {question.showIf && <StatusPill tone="violet">Ветка</StatusPill>}
            {question.isLegacy && <StatusPill tone="gray">Legacy</StatusPill>}
          </span>
        </span>
      </button>
      <div className="admin-qb-card-actions">
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Поднять вопрос ${question.id}`} disabled={isSaving || !canMoveUp} onClick={onMoveUp}>
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Опустить вопрос ${question.id}`} disabled={isSaving || !canMoveDown} onClick={onMoveDown}>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
        </Button>
        <Switch
          aria-label={`${isEnabled ? 'Отключить' : 'Включить'} вопрос ${question.id}`}
          checked={isEnabled}
          disabled={isSaving}
          onCheckedChange={onToggle}
          size="sm"
        />
      </div>
    </article>
  )
}

function SelectedSectionTitleEditor({
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
    <form className="admin-qb-section-editor" onSubmit={(event) => void submit(event)}>
      <Field>
        <FieldLabel htmlFor={`section-title-${section.id}`}>Название выбранного раздела</FieldLabel>
        <Input
          id={`section-title-${section.id}`}
          value={title}
          onChange={(event) => setTitle(event.currentTarget.value)}
        />
      </Field>
      <Button type="submit" size="sm" variant="outline" disabled={isSaving || !isDirty || !trimmedTitle}>
        <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
        Сохранить раздел
      </Button>
    </form>
  )
}

function QuestionInspector({
  record,
  section,
  question,
  isSaving,
  onSave,
  onToggleQuestion,
  onMoveOption,
  stats,
}: {
  record: QuestionnaireDefinitionRecord
  section: QuestionnaireSection
  question: QuestionnaireQuestion | null
  isSaving: boolean
  onSave: SaveDefinitionEdit
  onToggleQuestion: (checked: boolean) => void | undefined
  onMoveOption: (question: QuestionnaireQuestion, optionId: string, direction: MoveDirection) => Promise<void>
  stats: ReturnType<typeof definitionStats>
}) {
  if (!question) {
    return (
      <aside className="admin-qb-inspector" aria-label="Редактор вопроса">
        <div className="admin-qb-empty">
          <Typography variant="h6">Выберите вопрос</Typography>
          <Typography variant="bodySm" tone="muted">В этом разделе пока нет вопроса для редактирования.</Typography>
        </div>
      </aside>
    )
  }

  const questionIndex = section.questions.findIndex((item) => item.id === question.id)
  const sectionIndex = record.sections.findIndex((item) => item.id === section.id)
  const options = question.options ?? []
  const disabledQuestionCount = stats.disabledQuestionCount + stats.disabledSectionCount

  return (
    <aside className="admin-qb-inspector" aria-label="Редактор вопроса">
      <div className="admin-qb-inspector-tabs" role="tablist" aria-label="Панель вопроса">
        <button className="admin-qb-inspector-tab is-active" type="button" role="tab" aria-selected="true">
          Редактор вопроса
        </button>
        <button className="admin-qb-inspector-tab" type="button" role="tab" aria-selected="false" disabled>
          Настройки логики
        </button>
      </div>

      <div className="admin-qb-inspector-grid">
        <div className="admin-qb-inspector-main">
          <QuestionPromptEditor question={question} isSaving={isSaving} onSave={onSave} />

          {options.length > 0 ? (
            <div className="admin-qb-option-list">
              <div className="admin-qb-field-head">
                <Typography variant="bodySmMedium">Варианты ответа</Typography>
                <Typography variant="caption" tone="muted">{enabledCount(options)} активных из {options.length}</Typography>
              </div>
              {options.map((option, index) => (
                <OptionRowEditor
                  key={`${question.id}-${option.id}`}
                  question={question}
                  option={option}
                  index={index}
                  isSaving={isSaving}
                  canMoveUp={index > 0}
                  canMoveDown={index < options.length - 1}
                  onSave={onSave}
                  onMoveUp={() => void onMoveOption(question, option.id, 'up')}
                  onMoveDown={() => void onMoveOption(question, option.id, 'down')}
                  onToggle={(checked) => void onSave({
                    target: 'option',
                    questionId: question.id,
                    optionId: option.id,
                    isEnabled: checked,
                  })}
                />
              ))}
              <Button type="button" variant="ghost" size="sm" disabled title="Новые option IDs требуют отдельной версии и миграции">
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                Добавить вариант
              </Button>
            </div>
          ) : (
            <div className="admin-qb-muted-panel">
              <Typography variant="bodySmMedium">Свободный ответ</Typography>
              <Typography variant="caption" tone="muted">У этого вопроса нет вариантов. Тип данных и валидация зафиксированы текущей версией.</Typography>
            </div>
          )}

          <div className="admin-qb-upload" aria-disabled="true">
            <HugeiconsIcon icon={Image01Icon} strokeWidth={2} />
            <div>
              <Typography variant="bodySmMedium">Загрузить изображение</Typography>
              <Typography variant="caption" tone="muted">Медиа появятся в отдельной версии опросника</Typography>
            </div>
          </div>
        </div>

        <div className="admin-qb-inspector-side">
          <div className="admin-qb-side-section">
            <Typography variant="bodySmMedium">Настройки показа</Typography>
            <div className="admin-qb-logic-box">
              <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
              <Typography variant="caption" tone="muted">{visibilitySummary(question.showIf)}</Typography>
            </div>
            <Field>
              <FieldLabel htmlFor={`question-condition-${question.id}`}>Зависит от ответа</FieldLabel>
              <Input id={`question-condition-${question.id}`} value={question.showIf ? 'Условие зафиксировано' : 'Всегда'} disabled readOnly />
            </Field>
            <Button type="button" variant="outline" size="sm" disabled title="Изменение ветвлений требует версии и миграции">
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Добавить условие
            </Button>
          </div>

          <div className="admin-qb-side-section">
            <Typography variant="bodySmMedium">Дополнительные настройки</Typography>
            <div className="admin-qb-switch-row">
              <div>
                <Typography variant="bodySmMedium">Включен</Typography>
                <Typography variant="caption" tone="muted">Вопрос виден в публичном опроснике.</Typography>
              </div>
              <Switch
                checked={itemIsEnabled(question)}
                disabled={isSaving}
                onCheckedChange={onToggleQuestion}
                aria-label={`${itemIsEnabled(question) ? 'Отключить' : 'Включить'} вопрос ${question.id}`}
              />
            </div>
            <Field>
              <FieldLabel htmlFor={`question-order-${question.id}`}>Порядок</FieldLabel>
              <Input id={`question-order-${question.id}`} value={String(questionIndex + 1)} disabled readOnly />
            </Field>
            <Field>
              <FieldLabel htmlFor={`question-tech-${question.id}`}>Техническое название</FieldLabel>
              <Input id={`question-tech-${question.id}`} value={question.id} disabled readOnly />
            </Field>
            <Typography variant="caption" tone="muted">ID используется в API, токенах различия и ветвлениях. Его нельзя менять без миграции.</Typography>
          </div>

          <div className="admin-qb-side-section compact">
            <Typography variant="bodySmMedium">Версия</Typography>
            <DefinitionMeta label="Версия" value={record.version} />
            <DefinitionMeta label="Hash" value={record.definitionHash} code />
            <DefinitionMeta label="Источник" value={record.sourceBrief} />
            <DefinitionMeta label="Обновлено" value={formatDefinitionDate(record.updatedAt)} />
            <DefinitionMeta label="Опубликовано" value={record.publishedAt ? formatDateTime(record.publishedAt) : 'Статическая версия'} />
          </div>

          <div className="admin-qb-side-section compact">
            <Typography variant="bodySmMedium">Сводка</Typography>
            <DefinitionMeta label="Раздел" value={`${sectionIndex + 1}. ${section.title}`} />
            <DefinitionMeta label="Отключено" value={`${disabledQuestionCount} блоков/вопросов, ${stats.disabledOptionCount} вариантов`} />
          </div>
        </div>
      </div>
    </aside>
  )
}

function QuestionPromptEditor({
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedPrompt || !isDirty) return
    await onSave({ target: 'question', questionId: question.id, prompt: trimmedPrompt })
  }

  return (
    <form className="admin-qb-question-editor" onSubmit={(event) => void submit(event)}>
      <div className="admin-qb-form-grid">
        <Field>
          <FieldLabel htmlFor={`question-id-${question.id}`}>ID вопроса</FieldLabel>
          <Input id={`question-id-${question.id}`} value={question.id} disabled readOnly />
        </Field>
        <Field>
          <FieldLabel htmlFor={`question-type-${question.id}`}>Тип вопроса</FieldLabel>
          <Input id={`question-type-${question.id}`} value={questionTypeLabel(question)} disabled readOnly />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor={`question-prompt-${question.id}`}>Вопрос</FieldLabel>
        <Textarea
          id={`question-prompt-${question.id}`}
          value={prompt}
          rows={3}
          onChange={(event) => setPrompt(event.currentTarget.value)}
        />
      </Field>

      <div className="admin-qb-save-row">
        <Typography variant="caption" tone="muted">Подсказки и варианты сохраняются отдельно, чтобы случайно не перезаписать соседние поля.</Typography>
        <Button type="submit" size="sm" disabled={isSaving || !isDirty || !trimmedPrompt}>
          <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
          Сохранить вопрос
        </Button>
      </div>
    </form>
  )
}

function OptionRowEditor({
  question,
  option,
  index,
  isSaving,
  canMoveUp,
  canMoveDown,
  onSave,
  onMoveUp,
  onMoveDown,
  onToggle,
}: {
  question: QuestionnaireQuestion
  option: QuestionnaireOption
  index: number
  isSaving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onSave: SaveDefinitionEdit
  onMoveUp: () => void
  onMoveDown: () => void
  onToggle: (checked: boolean) => void
}) {
  const [label, setLabel] = useState(option.label)
  const [hint, setHint] = useState(option.hint ?? '')
  const trimmedLabel = label.trim()
  const trimmedHint = hint.trim()
  const normalizedHint = trimmedHint || null
  const isDirty = trimmedLabel !== option.label || normalizedHint !== (option.hint ?? null)
  const isEnabled = itemIsEnabled(option)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!trimmedLabel || !isDirty) return
    await onSave({
      target: 'option',
      questionId: question.id,
      optionId: option.id,
      label: trimmedLabel,
      hint: normalizedHint,
    })
  }

  return (
    <form className={cn('admin-qb-option-row', !isEnabled && 'is-disabled')} onSubmit={(event) => void submit(event)}>
      <div className="admin-qb-option-grip">
        <DragHandle />
        <Typography variant="caption" tone="muted">{index + 1}</Typography>
      </div>
      <div className="admin-qb-option-edit">
        <Field>
          <FieldLabel htmlFor={`option-label-${question.id}-${option.id}`}>Label</FieldLabel>
          <Input
            id={`option-label-${question.id}-${option.id}`}
            value={label}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`option-hint-${question.id}-${option.id}`}>Hint</FieldLabel>
          <Input
            id={`option-hint-${question.id}-${option.id}`}
            value={hint}
            onChange={(event) => setHint(event.currentTarget.value)}
          />
        </Field>
        {option.showIf && <Typography variant="caption" tone="muted">{visibilitySummary(option.showIf)}</Typography>}
      </div>
      <div className="admin-qb-option-actions">
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Поднять вариант ${option.id}`} disabled={isSaving || !canMoveUp} onClick={onMoveUp}>
          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
        </Button>
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Опустить вариант ${option.id}`} disabled={isSaving || !canMoveDown} onClick={onMoveDown}>
          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
        </Button>
        <Switch
          aria-label={`${isEnabled ? 'Отключить' : 'Включить'} вариант ${option.id}`}
          checked={isEnabled}
          disabled={isSaving}
          onCheckedChange={onToggle}
          size="sm"
        />
        <Button type="submit" variant="outline" size="icon-xs" aria-label={`Сохранить вариант ${option.id}`} disabled={isSaving || !isDirty || !trimmedLabel}>
          <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} />
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
  value: string | number
  code?: boolean
}) {
  return (
    <div className="admin-definition-meta">
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography className={cn(code && 'admin-code-line')} variant="bodySmMedium">{String(value)}</Typography>
    </div>
  )
}

function DragHandle() {
  return (
    <span className="admin-drag-handle" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  )
}

type MoveDirection = 'up' | 'down'

function moveId(ids: string[], id: string, direction: MoveDirection) {
  const index = ids.indexOf(id)
  if (index === -1) return null
  const nextIndex = direction === 'up' ? index - 1 : index + 1
  if (nextIndex < 0 || nextIndex >= ids.length) return null
  const nextIds = [...ids]
  const current = nextIds[index]
  nextIds[index] = nextIds[nextIndex] ?? current
  nextIds[nextIndex] = current
  return nextIds
}

function itemIsEnabled(item: { isEnabled?: boolean }) {
  return item.isEnabled !== false
}

function enabledCount(items: readonly { isEnabled?: boolean }[]) {
  return items.filter(itemIsEnabled).length
}

function sectionIndexLabel(sections: readonly QuestionnaireSection[], selectedSection: QuestionnaireSection) {
  const index = sections.findIndex((section) => section.id === selectedSection.id)
  return `${index + 1}.`
}

function questionTypeLabel(question: QuestionnaireQuestion) {
  if ((question.options ?? []).length > 0) return 'Один вариант'
  if (question.id.toLowerCase().includes('area')) return 'Число'
  return 'Свободный ответ'
}

function definitionStats(record: QuestionnaireDefinitionRecord) {
  return record.sections.reduce(
    (stats, section) => {
      stats.sectionCount += 1
      stats.questionCount += section.questions.length
      stats.optionCount += section.questions.reduce((count, question) => count + (question.options?.length ?? 0), 0)
      if (!itemIsEnabled(section)) stats.disabledSectionCount += 1

      for (const question of section.questions) {
        if (!itemIsEnabled(question)) stats.disabledQuestionCount += 1
        stats.disabledOptionCount += (question.options ?? []).filter((option) => !itemIsEnabled(option)).length
      }

      return stats
    },
    {
      sectionCount: 0,
      questionCount: 0,
      optionCount: 0,
      disabledSectionCount: 0,
      disabledQuestionCount: 0,
      disabledOptionCount: 0,
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
