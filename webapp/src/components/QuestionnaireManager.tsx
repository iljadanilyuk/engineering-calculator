import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowReloadHorizontalIcon,
  ArrowUp01Icon,
  Delete02Icon,
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
  QuestionnaireProjectType,
  QuestionnaireQuestion,
  QuestionnaireQuestionAnswerType,
  QuestionnaireSection,
  QuestionnaireVisibilityRule,
} from '@poznyak-engineering-calculator/contracts'
import { getQuestionnaireQuestionAnswerType } from '@poznyak-engineering-calculator/contracts'
import { type DragEvent, type FormEvent, type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react'

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
type QuestionnaireBuilderTab = 'structure' | 'logic' | 'settings' | 'publication'

type BuilderDragState =
  | { kind: 'section'; sectionId: string }
  | { kind: 'question'; sectionId: string; questionId: string }
  | { kind: 'option'; questionId: string; optionId: string }

const questionnaireBuilderTabs: Array<{ id: QuestionnaireBuilderTab; label: string }> = [
  { id: 'structure', label: 'Структура' },
  { id: 'logic', label: 'Логика (ветвления)' },
  { id: 'settings', label: 'Настройки' },
  { id: 'publication', label: 'Публикация' },
]

const questionnaireAnswerTypeOptions: Array<{
  id: QuestionnaireQuestionAnswerType
  label: string
  detail: string
}> = [
  { id: 'single_option', label: 'Один вариант', detail: 'Radio-варианты с возможностью уточнения' },
  { id: 'text', label: 'Короткий текст', detail: 'Одна строка: адрес, модель, короткое уточнение' },
  { id: 'textarea', label: 'Длинный текст', detail: 'Несколько строк для описаний и комментариев' },
  { id: 'number', label: 'Число', detail: 'Площадь, толщина, количество или размер' },
  { id: 'phone', label: 'Телефон', detail: 'Контактный номер внутри вопроса' },
  { id: 'email', label: 'Email', detail: 'Почта клиента или ответственного' },
  { id: 'date', label: 'Дата', detail: 'Срок, дата замера или дедлайн' },
]

const questionnaireProjectTypeOptions: Array<{ id: QuestionnaireProjectType; label: string }> = [
  { id: 'private', label: 'Частный дом' },
  { id: 'apartment', label: 'Квартира' },
  { id: 'commercial', label: 'Коммерческий объект' },
]

function questionnaireBuilderTabId(tabId: QuestionnaireBuilderTab) {
  return `questionnaire-builder-tab-${tabId}`
}

function questionnaireBuilderPanelId(tabId: QuestionnaireBuilderTab) {
  return `questionnaire-builder-panel-${tabId}`
}

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
  const [activeTab, setActiveTab] = useState<QuestionnaireBuilderTab>('structure')
  const [dragState, setDragState] = useState<BuilderDragState | null>(null)
  const dragStateRef = useRef<BuilderDragState | null>(null)
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

  function selectBuilderTab(tabId: QuestionnaireBuilderTab, options: { focus?: boolean } = {}) {
    setActiveTab(tabId)
    if (options.focus) {
      window.requestAnimationFrame(() => document.getElementById(questionnaireBuilderTabId(tabId))?.focus())
    }
  }

  function handleBuilderTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabId: QuestionnaireBuilderTab) {
    const currentIndex = questionnaireBuilderTabs.findIndex((tab) => tab.id === tabId)
    const lastIndex = questionnaireBuilderTabs.length - 1
    const nextIndex = event.key === 'ArrowRight'
      ? Math.min(currentIndex + 1, lastIndex)
      : event.key === 'ArrowLeft'
        ? Math.max(currentIndex - 1, 0)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lastIndex
            : -1

    if (nextIndex === -1) return
    event.preventDefault()
    selectBuilderTab(questionnaireBuilderTabs[nextIndex]?.id ?? tabId, { focus: true })
  }

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

  async function dropSection(sectionId: string | null) {
    const activeDrag = dragStateRef.current ?? dragState
    if (!record || activeDrag?.kind !== 'section') return
    const sectionIds = reorderId(record.sections.map((section) => section.id), activeDrag.sectionId, sectionId)
    clearDragState()
    if (!sectionIds) return
    await saveEdit({ target: 'section_order', sectionIds })
  }

  async function moveQuestion(section: QuestionnaireSection, questionId: string, direction: MoveDirection) {
    const questionIds = moveId(section.questions.map((question) => question.id), questionId, direction)
    if (!questionIds) return
    await saveEdit({ target: 'question_order', sectionId: section.id, questionIds })
  }

  async function dropQuestion(section: QuestionnaireSection, questionId: string | null) {
    const activeDrag = dragStateRef.current ?? dragState
    if (activeDrag?.kind !== 'question' || activeDrag.sectionId !== section.id) return
    const draggedQuestionId = activeDrag.questionId
    const questionIds = reorderId(section.questions.map((question) => question.id), draggedQuestionId, questionId)
    clearDragState()
    if (!questionIds) return
    await saveEdit({ target: 'question_order', sectionId: section.id, questionIds })
    setSelectedQuestionId(draggedQuestionId)
  }

  async function moveOption(question: QuestionnaireQuestion, optionId: string, direction: MoveDirection) {
    const optionIds = moveId((question.options ?? []).map((option) => option.id), optionId, direction)
    if (!optionIds) return
    await saveEdit({ target: 'option_order', questionId: question.id, optionIds })
  }

  async function dropOption(question: QuestionnaireQuestion, optionId: string | null) {
    const activeDrag = dragStateRef.current ?? dragState
    if (activeDrag?.kind !== 'option' || activeDrag.questionId !== question.id) return
    const optionIds = reorderId((question.options ?? []).map((option) => option.id), activeDrag.optionId, optionId)
    clearDragState()
    if (!optionIds) return
    await saveEdit({ target: 'option_order', questionId: question.id, optionIds })
  }

  function startDrag(event: DragEvent<HTMLElement>, state: BuilderDragState) {
    const dragTarget = event.target instanceof HTMLElement ? event.target : null
    const startedOnHandle = dragTarget?.closest('.admin-drag-handle')
    const startedOnInteractiveControl = dragTarget?.closest('button, input, textarea, select')

    if (isSaving || (startedOnInteractiveControl && !startedOnHandle)) {
      event.preventDefault()
      return
    }

    dragStateRef.current = state
    setDragState(state)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', dragStateLabel(state))
  }

  function startPointerDrag(state: BuilderDragState) {
    if (isSaving) return
    dragStateRef.current = state
    setDragState(state)
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    if (isSaving) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  function finishDrag() {
    clearDragState()
  }

  function finishPointerDrag(event: PointerEvent<HTMLSpanElement>) {
    if (isSaving) {
      clearDragState()
      return
    }

    const hovered = document.elementFromPoint(event.clientX, event.clientY)
    const dropTarget = hovered?.closest<HTMLElement>('[data-qb-drop-kind]')
    if (!dropTarget) {
      clearDragState()
      return
    }

    const targetId = dropTarget.dataset.qbDropId === '__end__' ? null : dropTarget.dataset.qbDropId ?? null

    if (dropTarget.dataset.qbDropKind === 'section') {
      void dropSection(targetId)
      return
    }

    if (dropTarget.dataset.qbDropKind === 'question') {
      const section = record?.sections.find((item) => item.id === dropTarget.dataset.qbDropSection)
      if (section) {
        void dropQuestion(section, targetId)
        return
      }
    }

    if (dropTarget.dataset.qbDropKind === 'option') {
      const targetQuestion = record?.sections
        .flatMap((item) => item.questions)
        .find((item) => item.id === dropTarget.dataset.qbDropQuestion)
      if (targetQuestion) {
        void dropOption(targetQuestion, targetId)
        return
      }
    }

    clearDragState()
  }

  function clearDragState() {
    dragStateRef.current = null
    setDragState(null)
  }

  function selectSection(section: QuestionnaireSection) {
    setSelectedSectionId(section.id)
    setSelectedQuestionId(section.questions[0]?.id ?? null)
  }

  function promptCreateSection() {
    const title = window.prompt('Название нового раздела')
    const trimmedTitle = title?.trim()
    if (!trimmedTitle) return
    void saveEdit({
      target: 'section_create',
      title: trimmedTitle,
      questionPrompt: 'Новый вопрос',
      answerType: 'text',
    })
  }

  function promptCreateQuestion(section: QuestionnaireSection) {
    const prompt = window.prompt('Текст нового вопроса')
    const trimmedPrompt = prompt?.trim()
    if (!trimmedPrompt) return
    void saveEdit({
      target: 'question_create',
      sectionId: section.id,
      prompt: trimmedPrompt,
      answerType: 'text',
    })
  }

  function deleteSelectedQuestion(question: QuestionnaireQuestion) {
    if (!window.confirm(`Удалить вопрос ${question.id} из новой версии опросника?`)) return
    void saveEdit({ target: 'question_delete', questionId: question.id })
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
        {questionnaireBuilderTabs.map((tab) => (
          <button
            key={tab.id}
            className={cn('admin-questionnaire-tab', activeTab === tab.id && 'is-active')}
            id={questionnaireBuilderTabId(tab.id)}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={questionnaireBuilderPanelId(tab.id)}
            tabIndex={activeTab === tab.id ? 0 : -1}
            onClick={() => selectBuilderTab(tab.id)}
            onKeyDown={(event) => handleBuilderTabKeyDown(event, tab.id)}
          >
            {tab.label}
          </button>
        ))}
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

      {activeTab === 'structure' ? (
      <div
        className="admin-questionnaire-builder"
        data-busy={isSaving ? 'true' : 'false'}
        id={questionnaireBuilderPanelId('structure')}
        role="tabpanel"
        aria-labelledby={questionnaireBuilderTabId('structure')}
      >
        <aside className="admin-qb-panel admin-qb-sections" aria-label="Структура опросника">
          <div className="admin-qb-panel-head">
            <div>
              <Typography variant="caption" tone="muted">Структура опросника</Typography>
              <Typography variant="bodySmMedium">{stats.sectionCount} разделов · {stats.questionCount} вопросов</Typography>
            </div>
            <StatusPill tone={record.status === 'published' ? 'green' : 'gray'}>{definitionStatusLabel(record.status)}</StatusPill>
          </div>

          <div className="admin-qb-action-row">
            <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={promptCreateSection}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
              Добавить раздел
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={() => promptCreateQuestion(selectedSection)}>
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
                isDragging={dragState?.kind === 'section' && dragState.sectionId === section.id}
                onSelect={() => selectSection(section)}
                onMoveUp={() => void moveSection(section.id, 'up')}
                onMoveDown={() => void moveSection(section.id, 'down')}
                onDragStart={(event) => startDrag(event, { kind: 'section', sectionId: section.id })}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault()
                  void dropSection(section.id)
                }}
                onMouseDrop={() => void dropSection(section.id)}
                onPointerDragStart={() => startPointerDrag({ kind: 'section', sectionId: section.id })}
                onPointerDragEnd={finishPointerDrag}
                onDragEnd={finishDrag}
                onToggle={(checked) => void saveEdit({ target: 'section', sectionId: section.id, isEnabled: checked })}
              />
            ))}
          </div>

          <div
            className={cn('admin-qb-dropzone', dragState?.kind === 'section' && 'is-ready')}
            data-testid="section-dropzone-end"
            data-qb-drop-kind="section"
            data-qb-drop-id="__end__"
            onDragOver={allowDrop}
            onDrop={(event) => {
              event.preventDefault()
              void dropSection(null)
            }}
            onMouseUp={() => void dropSection(null)}
          >
            <Typography variant="caption" tone="muted">Перетащите раздел сюда, чтобы поставить в конец</Typography>
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
                sectionId={selectedSection.id}
                sectionIndex={record.sections.findIndex((section) => section.id === selectedSection.id)}
                isSelected={question.id === selectedQuestion?.id}
                isSaving={isSaving}
                canMoveUp={index > 0}
                canMoveDown={index < selectedSection.questions.length - 1}
                isDragging={dragState?.kind === 'question' && dragState.questionId === question.id}
                onSelect={() => setSelectedQuestionId(question.id)}
                onMoveUp={() => void moveQuestion(selectedSection, question.id, 'up')}
                onMoveDown={() => void moveQuestion(selectedSection, question.id, 'down')}
                onDragStart={(event) => startDrag(event, {
                  kind: 'question',
                  sectionId: selectedSection.id,
                  questionId: question.id,
                })}
                onDragOver={allowDrop}
                onDrop={(event) => {
                  event.preventDefault()
                  void dropQuestion(selectedSection, question.id)
                }}
                onMouseDrop={() => void dropQuestion(selectedSection, question.id)}
                onPointerDragStart={() => startPointerDrag({
                  kind: 'question',
                  sectionId: selectedSection.id,
                  questionId: question.id,
                })}
                onPointerDragEnd={finishPointerDrag}
                onDragEnd={finishDrag}
                onToggle={(checked) => void saveEdit({ target: 'question', questionId: question.id, isEnabled: checked })}
              />
            ))}
          </div>

          <div
            className={cn('admin-qb-dropzone', dragState?.kind === 'question' && 'is-ready')}
            data-testid="question-dropzone-end"
            data-qb-drop-kind="question"
            data-qb-drop-section={selectedSection.id}
            data-qb-drop-id="__end__"
            onDragOver={allowDrop}
            onDrop={(event) => {
              event.preventDefault()
              void dropQuestion(selectedSection, null)
            }}
            onMouseUp={() => void dropQuestion(selectedSection, null)}
          >
            <Typography variant="caption" tone="muted">Перетащите вопрос сюда, чтобы поставить в конец раздела</Typography>
          </div>

          <Button type="button" variant="ghost" size="sm" disabled={isSaving} onClick={() => promptCreateQuestion(selectedSection)}>
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
          onDeleteQuestion={() => selectedQuestion ? deleteSelectedQuestion(selectedQuestion) : undefined}
          onMoveOption={moveOption}
          draggedOptionId={dragState?.kind === 'option' ? dragState.optionId : null}
          onOptionDragStart={(event, question, optionId) => startDrag(event, {
            kind: 'option',
            questionId: question.id,
            optionId,
          })}
          onOptionDragOver={allowDrop}
          onOptionDrop={(event, question, optionId) => {
            event.preventDefault()
            void dropOption(question, optionId)
          }}
          onOptionMouseDrop={(question, optionId) => void dropOption(question, optionId)}
          onOptionDropEnd={(event, question) => {
            event.preventDefault()
            void dropOption(question, null)
          }}
          onOptionMouseDropEnd={(question) => void dropOption(question, null)}
          onOptionPointerDragStart={(question, optionId) => startPointerDrag({
            kind: 'option',
            questionId: question.id,
            optionId,
          })}
          onOptionPointerDragEnd={finishPointerDrag}
          onOptionDragEnd={finishDrag}
          stats={stats}
        />
      </div>
      ) : (
        <QuestionnaireSecondaryPanel
          activeTab={activeTab}
          record={record}
          selectedQuestion={selectedQuestion}
          isSaving={isSaving}
          onSave={saveEdit}
          onSelectQuestion={(sectionId, questionId) => {
            setSelectedSectionId(sectionId)
            setSelectedQuestionId(questionId)
          }}
        />
      )}
    </section>
  )
}

function QuestionnaireSecondaryPanel({
  activeTab,
  record,
  selectedQuestion,
  isSaving,
  onSave,
  onSelectQuestion,
}: {
  activeTab: Exclude<QuestionnaireBuilderTab, 'structure'>
  record: QuestionnaireDefinitionRecord
  selectedQuestion: QuestionnaireQuestion | null
  isSaving: boolean
  onSave: SaveDefinitionEdit
  onSelectQuestion: (sectionId: string, questionId: string) => void
}) {
  if (activeTab === 'logic') {
    return (
      <QuestionnaireLogicPanel
        record={record}
        selectedQuestion={selectedQuestion}
        isSaving={isSaving}
        onSave={onSave}
        onSelectQuestion={onSelectQuestion}
      />
    )
  }

  if (activeTab === 'settings') {
    return (
      <QuestionnaireSettingsPanel
        record={record}
        selectedQuestion={selectedQuestion}
        isSaving={isSaving}
        onSave={onSave}
      />
    )
  }

  return <QuestionnairePublicationPanel record={record} />
}

function QuestionnaireLogicPanel({
  record,
  selectedQuestion,
  isSaving,
  onSave,
  onSelectQuestion,
}: {
  record: QuestionnaireDefinitionRecord
  selectedQuestion: QuestionnaireQuestion | null
  isSaving: boolean
  onSave: SaveDefinitionEdit
  onSelectQuestion: (sectionId: string, questionId: string) => void
}) {
  const questions = questionnaireQuestionsWithSections(record)
  const operationalQuestions = questions.filter(({ section, question }) =>
    itemIsEnabled(section) && !section.isLegacy && itemIsEnabled(question) && !question.isLegacy,
  )
  const selected = selectedQuestion
    ? questions.find((item) => item.question.id === selectedQuestion.id) ?? questions[0]
    : questions[0]
  const projectTypeRows = questionnaireProjectTypeOptions.map((projectType) => ({
    ...projectType,
    questions: operationalQuestions.filter((item) =>
      visibilityTargetsProjectType(item.question.showIf, projectType.id),
    ),
  }))
  const conditionalQuestions = operationalQuestions.filter((item) => item.question.showIf)

  return (
    <div
      className="admin-questionnaire-tab-panel logic"
      data-busy={isSaving ? 'true' : 'false'}
      id={questionnaireBuilderPanelId('logic')}
      role="tabpanel"
      aria-labelledby={questionnaireBuilderTabId('logic')}
    >
      <section className="admin-qb-panel admin-qb-wide-panel">
        <div className="admin-qb-panel-head">
          <div>
            <Typography variant="caption" tone="muted">Логика показа</Typography>
            <Typography variant="bodySmMedium">{conditionalQuestions.length} вопросов с условиями</Typography>
          </div>
          <StatusPill tone="blue">Тип объекта активен</StatusPill>
        </div>

        <div className="admin-qb-project-type-grid" aria-label="Влияние типа объекта">
          {projectTypeRows.map((row) => (
            <article key={row.id} className="admin-qb-info-tile">
              <Typography variant="bodySmMedium">{row.label}</Typography>
              <Typography variant="h6">{row.questions.length}</Typography>
              <Typography variant="caption" tone="muted">вопросов с отдельным показом</Typography>
            </article>
          ))}
        </div>

        <div className="admin-qb-rule-list" aria-label="Условия вопросов">
          {questions.map(({ section, question }) => (
            <button
              key={question.id}
              className={cn(
                'admin-qb-rule-row',
                selected?.question.id === question.id && 'is-active',
                !itemIsEnabled(question) && 'is-disabled',
              )}
              type="button"
              onClick={() => onSelectQuestion(section.id, question.id)}
            >
              <span>
                <Typography variant="bodySmMedium">{question.prompt}</Typography>
                <Typography variant="caption" tone="muted">{section.title} · {question.id}</Typography>
              </span>
              <span className="admin-qb-card-meta">
                <StatusPill tone="gray">{questionTypeLabel(question)}</StatusPill>
                <StatusPill tone={question.showIf ? 'violet' : 'gray'}>{visibilitySummary(question.showIf)}</StatusPill>
              </span>
            </button>
          ))}
        </div>
      </section>

      <aside className="admin-qb-panel admin-qb-wide-side">
        {selected ? (
          <>
            <div className="admin-qb-panel-head">
              <div>
                <Typography variant="caption" tone="muted">Выбранный вопрос</Typography>
                <Typography variant="bodySmMedium">{selected.question.prompt}</Typography>
              </div>
            </div>
            <div className="admin-qb-logic-box">
              <HugeiconsIcon icon={GitBranchIcon} strokeWidth={2} />
              <Typography variant="caption" tone="muted">{visibilitySummary(selected.question.showIf)}</Typography>
            </div>
            <QuestionVisibilityEditor
              key={`${record.definitionHash}-${selected.question.id}-${JSON.stringify(selected.question.showIf ?? null)}`}
              record={record}
              question={selected.question}
              isSaving={isSaving}
              onSave={onSave}
            />
            <div className="admin-qb-side-section compact">
              <Typography variant="bodySmMedium">Тип объекта клиента</Typography>
              {questionnaireProjectTypeOptions.map((projectType) => (
                <DefinitionMeta
                  key={projectType.id}
                  label={projectType.label}
                  value={visibilityProjectTypeSummary(selected.question.showIf, projectType.id)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="admin-qb-empty">
            <Typography variant="h6">Вопросы не найдены</Typography>
          </div>
        )}
      </aside>
    </div>
  )
}

function QuestionnaireSettingsPanel({
  record,
  selectedQuestion,
  isSaving,
  onSave,
}: {
  record: QuestionnaireDefinitionRecord
  selectedQuestion: QuestionnaireQuestion | null
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const stats = definitionStats(record)

  return (
    <div
      className="admin-questionnaire-tab-panel settings"
      data-busy={isSaving ? 'true' : 'false'}
      id={questionnaireBuilderPanelId('settings')}
      role="tabpanel"
      aria-labelledby={questionnaireBuilderTabId('settings')}
    >
      <section className="admin-qb-panel admin-qb-wide-panel">
        <div className="admin-qb-panel-head">
          <div>
            <Typography variant="caption" tone="muted">Настройки опросника</Typography>
            <Typography variant="bodySmMedium">{stats.sectionCount} разделов · {stats.questionCount} вопросов · {stats.optionCount} вариантов</Typography>
          </div>
          <StatusPill tone={record.status === 'published' ? 'green' : 'gray'}>{definitionStatusLabel(record.status)}</StatusPill>
        </div>

        <div className="admin-qb-type-grid" aria-label="Доступные типы вопросов">
          {questionnaireAnswerTypeOptions.map((type) => (
            <article key={type.id} className="admin-qb-info-tile">
              <Typography variant="bodySmMedium">{type.label}</Typography>
              <Typography variant="caption" tone="muted">{type.detail}</Typography>
            </article>
          ))}
        </div>

        <div className="admin-definition-meta-grid">
          <DefinitionMeta label="Активные разделы" value={`${stats.sectionCount - stats.disabledSectionCount} из ${stats.sectionCount}`} />
          <DefinitionMeta label="Отключенные вопросы" value={stats.disabledQuestionCount} />
          <DefinitionMeta label="Отключенные варианты" value={stats.disabledOptionCount} />
          <DefinitionMeta label="Версия" value={record.version} />
        </div>
      </section>

      <aside className="admin-qb-panel admin-qb-wide-side">
        {selectedQuestion ? (
          <>
            <div className="admin-qb-panel-head">
              <div>
                <Typography variant="caption" tone="muted">Текущий вопрос</Typography>
                <Typography variant="bodySmMedium">{selectedQuestion.prompt}</Typography>
              </div>
            </div>
            <QuestionTypeField question={selectedQuestion} isSaving={isSaving} onSave={onSave} />
            <DefinitionMeta label="ID" value={selectedQuestion.id} code />
            <DefinitionMeta label="Source row" value={selectedQuestion.sourceRow} />
            <DefinitionMeta label="Показ" value={visibilitySummary(selectedQuestion.showIf)} />
          </>
        ) : (
          <div className="admin-qb-empty">
            <Typography variant="h6">Выберите вопрос</Typography>
          </div>
        )}
      </aside>
    </div>
  )
}

function QuestionnairePublicationPanel({
  record,
}: {
  record: QuestionnaireDefinitionRecord
}) {
  const stats = definitionStats(record)

  return (
    <div
      className="admin-questionnaire-tab-panel publication"
      id={questionnaireBuilderPanelId('publication')}
      role="tabpanel"
      aria-labelledby={questionnaireBuilderTabId('publication')}
    >
      <section className="admin-qb-panel admin-qb-wide-panel">
        <div className="admin-qb-panel-head">
          <div>
            <Typography variant="caption" tone="muted">Публикация</Typography>
            <Typography variant="bodySmMedium">Активная backend-версия для /questionnaire/</Typography>
          </div>
          <StatusPill tone={record.status === 'published' ? 'green' : 'gray'}>{definitionStatusLabel(record.status)}</StatusPill>
        </div>

        <div className="admin-definition-meta-grid">
          <DefinitionMeta label="Версия" value={record.version} />
          <DefinitionMeta label="Hash" value={record.definitionHash} code />
          <DefinitionMeta label="Источник" value={record.sourceBrief} />
          <DefinitionMeta label="Workbook" value={record.sourceWorkbook} />
          <DefinitionMeta label="Worksheet" value={record.sourceWorksheet} />
          <DefinitionMeta label="Source updated" value={record.sourceUpdatedAt} />
          <DefinitionMeta label="Backend updated" value={formatDefinitionDate(record.updatedAt)} />
          <DefinitionMeta label="Published at" value={record.publishedAt ? formatDateTime(record.publishedAt) : 'Static fallback'} />
        </div>
      </section>

      <aside className="admin-qb-panel admin-qb-wide-side">
        <Typography variant="bodySmMedium">Срез публикации</Typography>
        <DefinitionMeta label="Разделы" value={stats.sectionCount} />
        <DefinitionMeta label="Вопросы" value={stats.questionCount} />
        <DefinitionMeta label="Варианты" value={stats.optionCount} />
        <DefinitionMeta label="Политика источника" value={record.sourcePolicy} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => window.open('/questionnaire/', '_blank', 'noopener,noreferrer')}
        >
          <HugeiconsIcon icon={FileViewIcon} strokeWidth={2} data-icon="inline-start" />
          Открыть публичный опросник
        </Button>
      </aside>
    </div>
  )
}

function SectionCard({
  section,
  index,
  isSelected,
  isSaving,
  canMoveUp,
  canMoveDown,
  isDragging,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onMouseDrop,
  onPointerDragStart,
  onPointerDragEnd,
  onDragEnd,
  onToggle,
}: {
  section: QuestionnaireSection
  index: number
  isSelected: boolean
  isSaving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  isDragging: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDragStart: (event: DragEvent<HTMLSpanElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onMouseDrop: () => void
  onPointerDragStart: () => void
  onPointerDragEnd: (event: PointerEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
  onToggle: (checked: boolean) => void
}) {
  const isEnabled = itemIsEnabled(section)

  return (
    <article
      className={cn('admin-qb-section-card', isSelected && 'is-active', !isEnabled && 'is-disabled', isDragging && 'is-dragging')}
      aria-label={`Раздел ${section.title}`}
      data-testid={`section-card-${section.id}`}
      data-qb-drop-kind="section"
      data-qb-drop-id={section.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseUp={onMouseDrop}
    >
      <button className="admin-qb-card-main" type="button" onClick={onSelect}>
        <DragHandle
          draggable={!isSaving}
          testId={`section-drag-${section.id}`}
          onDragStart={onDragStart}
          onPointerDown={onPointerDragStart}
          onPointerUp={onPointerDragEnd}
          onDragEnd={onDragEnd}
        />
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
  sectionId,
  sectionIndex,
  isSelected,
  isSaving,
  canMoveUp,
  canMoveDown,
  isDragging,
  onSelect,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onMouseDrop,
  onPointerDragStart,
  onPointerDragEnd,
  onDragEnd,
  onToggle,
}: {
  question: QuestionnaireQuestion
  index: number
  sectionId: string
  sectionIndex: number
  isSelected: boolean
  isSaving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  isDragging: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDragStart: (event: DragEvent<HTMLSpanElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onMouseDrop: () => void
  onPointerDragStart: () => void
  onPointerDragEnd: (event: PointerEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
  onToggle: (checked: boolean) => void
}) {
  const isEnabled = itemIsEnabled(question)

  return (
    <article
      className={cn('admin-qb-question-card', isSelected && 'is-active', !isEnabled && 'is-disabled', isDragging && 'is-dragging')}
      aria-label={`Вопрос ${question.id}`}
      data-testid={`question-card-${question.id}`}
      data-qb-drop-kind="question"
      data-qb-drop-section={sectionId}
      data-qb-drop-id={question.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseUp={onMouseDrop}
    >
      <button className="admin-qb-card-main" type="button" onClick={onSelect}>
        <DragHandle
          draggable={!isSaving}
          testId={`question-drag-${question.id}`}
          onDragStart={onDragStart}
          onPointerDown={onPointerDragStart}
          onPointerUp={onPointerDragEnd}
          onDragEnd={onDragEnd}
        />
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
  onDeleteQuestion,
  onMoveOption,
  draggedOptionId,
  onOptionDragStart,
  onOptionDragOver,
  onOptionDrop,
  onOptionMouseDrop,
  onOptionDropEnd,
  onOptionMouseDropEnd,
  onOptionPointerDragStart,
  onOptionPointerDragEnd,
  onOptionDragEnd,
  stats,
}: {
  record: QuestionnaireDefinitionRecord
  section: QuestionnaireSection
  question: QuestionnaireQuestion | null
  isSaving: boolean
  onSave: SaveDefinitionEdit
  onToggleQuestion: (checked: boolean) => void | undefined
  onDeleteQuestion: () => void | undefined
  onMoveOption: (question: QuestionnaireQuestion, optionId: string, direction: MoveDirection) => Promise<void>
  draggedOptionId: string | null
  onOptionDragStart: (event: DragEvent<HTMLSpanElement>, question: QuestionnaireQuestion, optionId: string) => void
  onOptionDragOver: (event: DragEvent<HTMLElement>) => void
  onOptionDrop: (event: DragEvent<HTMLElement>, question: QuestionnaireQuestion, optionId: string) => void
  onOptionMouseDrop: (question: QuestionnaireQuestion, optionId: string) => void
  onOptionDropEnd: (event: DragEvent<HTMLElement>, question: QuestionnaireQuestion) => void
  onOptionMouseDropEnd: (question: QuestionnaireQuestion) => void
  onOptionPointerDragStart: (question: QuestionnaireQuestion, optionId: string) => void
  onOptionPointerDragEnd: (event: PointerEvent<HTMLSpanElement>) => void
  onOptionDragEnd: () => void
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
      <div className="admin-qb-inspector-heading">
        <div>
          <Typography variant="caption" tone="muted">Редактор вопроса</Typography>
          <Typography variant="bodySmMedium">Текст, варианты, тип ответа и логика показа</Typography>
        </div>
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
                  isDragging={draggedOptionId === option.id}
                  onSave={onSave}
                  onMoveUp={() => void onMoveOption(question, option.id, 'up')}
                  onMoveDown={() => void onMoveOption(question, option.id, 'down')}
                  onDragStart={(event) => onOptionDragStart(event, question, option.id)}
                  onDragOver={onOptionDragOver}
                  onDrop={(event) => onOptionDrop(event, question, option.id)}
                  onMouseDrop={() => onOptionMouseDrop(question, option.id)}
                  onPointerDragStart={() => onOptionPointerDragStart(question, option.id)}
                  onPointerDragEnd={onOptionPointerDragEnd}
                  onDragEnd={onOptionDragEnd}
                  onToggle={(checked) => void onSave({
                    target: 'option',
                    questionId: question.id,
                    optionId: option.id,
                    isEnabled: checked,
                  })}
                  onDelete={() => void onSave({
                    target: 'option_delete',
                    questionId: question.id,
                    optionId: option.id,
                  })}
                />
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSaving}
                onClick={() => void onSave({
                  target: 'option_create',
                  questionId: question.id,
                  label: `Новый вариант ${options.length + 1}`,
                })}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                Добавить вариант
              </Button>
              <div
                className={cn('admin-qb-dropzone compact', draggedOptionId && 'is-ready')}
                data-testid="option-dropzone-end"
                data-qb-drop-kind="option"
                data-qb-drop-question={question.id}
                data-qb-drop-id="__end__"
                onDragOver={onOptionDragOver}
                onDrop={(event) => onOptionDropEnd(event, question)}
                onMouseUp={() => onOptionMouseDropEnd(question)}
              >
                <Typography variant="caption" tone="muted">Перетащите вариант сюда, чтобы поставить в конец</Typography>
              </div>
            </div>
          ) : (
            <div className="admin-qb-muted-panel">
              <Typography variant="bodySmMedium">Свободный ответ</Typography>
              <Typography variant="caption" tone="muted">Можно оставить текст/число или создать варианты ответа в новой опубликованной версии.</Typography>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving}
                onClick={() => void onSave({
                  target: 'option_create',
                  questionId: question.id,
                  label: 'Вариант 1',
                })}
              >
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                Добавить вариант
              </Button>
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
            <QuestionVisibilityEditor
              record={record}
              question={question}
              isSaving={isSaving}
              onSave={onSave}
            />
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
            <Button type="button" variant="destructive" size="sm" disabled={isSaving} onClick={onDeleteQuestion}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} data-icon="inline-start" />
              Удалить вопрос
            </Button>
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
        <QuestionTypeField question={question} isSaving={isSaving} onSave={onSave} />
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

function QuestionTypeField({
  question,
  isSaving,
  onSave,
}: {
  question: QuestionnaireQuestion
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const type = questionTypeKind(question)
  const hintId = `question-type-hint-${question.id}`

  async function changeType(value: string) {
    const answerType = value as QuestionnaireQuestionAnswerType
    if (answerType === type) return
    await onSave({ target: 'question', questionId: question.id, answerType })
  }

  return (
    <Field>
      <FieldLabel htmlFor={`question-type-${question.id}`}>Тип вопроса</FieldLabel>
      <select
        className="admin-qb-select"
        id={`question-type-${question.id}`}
        value={type}
        disabled={isSaving}
        aria-describedby={hintId}
        title="Смена типа публикует новую версию опросника; начатые анкеты остаются на своем snapshot"
        onChange={(event) => void changeType(event.currentTarget.value)}
      >
        {questionnaireAnswerTypeOptions.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
      <Typography id={hintId} variant="caption" tone="muted">
        Тип можно менять. При переходе с вариантов на свободное поле варианты убираются из новой версии, старые анкеты остаются без изменений.
      </Typography>
    </Field>
  )
}

type VisibilityEditorMode = 'always' | 'exists' | 'equals'
type DirectVisibilityRule = Extract<QuestionnaireVisibilityRule, { questionId: string }>

function QuestionVisibilityEditor({
  record,
  question,
  isSaving,
  onSave,
}: {
  record: QuestionnaireDefinitionRecord
  question: QuestionnaireQuestion
  isSaving: boolean
  onSave: SaveDefinitionEdit
}) {
  const orderedQuestions = record.sections
    .flatMap((section) => section.questions)
    .filter((item) => item.id === question.id || (itemIsEnabled(item) && !item.isLegacy))
  const questionIndex = orderedQuestions.findIndex((item) => item.id === question.id)
  const sourceQuestions = questionIndex > 0 ? orderedQuestions.slice(0, questionIndex) : []
  const optionQuestions = sourceQuestions.filter((item) =>
    (item.options ?? []).some((option) => itemIsEnabled(option)),
  )
  const initialState = visibilityEditorState(question.showIf, sourceQuestions)
  const [mode, setMode] = useState<VisibilityEditorMode>(initialState.mode)
  const [sourceQuestionId, setSourceQuestionId] = useState(initialState.sourceQuestionId)
  const [optionQuestionId, setOptionQuestionId] = useState(initialState.optionQuestionId)
  const selectedOptionQuestion = optionQuestions.find((item) => item.id === optionQuestionId) ?? optionQuestions[0]
  const selectedOptionQuestionOptions = selectedOptionQuestion?.options?.filter((option) => itemIsEnabled(option)) ?? []
  const [optionId, setOptionId] = useState(
    initialState.optionId ?? selectedOptionQuestionOptions[0]?.id ?? '',
  )
  const [projectTypes, setProjectTypes] = useState<readonly QuestionnaireProjectType[]>(
    initialState.projectTypes,
  )
  const optionIdIsAvailable = selectedOptionQuestionOptions.some((option) => option.id === optionId)
  const effectiveOptionId = optionIdIsAvailable ? optionId : selectedOptionQuestionOptions[0]?.id || ''
  const isAdvanced = initialState.isAdvanced
  const canSave =
    !isAdvanced &&
    projectTypes.length > 0 &&
    (
      mode === 'always' ||
      (mode === 'exists' && Boolean(sourceQuestionId)) ||
      (mode === 'equals' && Boolean(selectedOptionQuestion && effectiveOptionId))
    )

  async function saveVisibility() {
    if (!canSave) return

    await onSave({
      target: 'question',
      questionId: question.id,
      showIf: buildVisibilityRule({
        mode,
        sourceQuestionId,
        optionQuestionId: selectedOptionQuestion?.id ?? '',
        optionId: effectiveOptionId,
        projectTypes,
      }),
    })
  }

  return (
    <div className="admin-qb-visibility-editor">
      <Field>
        <FieldLabel htmlFor={`question-show-mode-${question.id}`}>Показывать вопрос</FieldLabel>
        <select
          className="admin-qb-select"
          id={`question-show-mode-${question.id}`}
          value={mode}
          disabled={isSaving || isAdvanced}
          onChange={(event) => setMode(event.currentTarget.value as VisibilityEditorMode)}
        >
          <option value="always">Всегда</option>
          <option value="exists">Если вопрос отвечен</option>
          <option value="equals">Если выбран вариант</option>
        </select>
      </Field>

      <div className="admin-qb-visibility-scope">
        <Typography variant="bodySmMedium">Тип объекта</Typography>
        <div className="admin-qb-checkbox-grid" role="group" aria-label="Типы объекта для показа вопроса">
          {questionnaireProjectTypeOptions.map((projectType) => (
            <label key={projectType.id} className="admin-qb-checkbox-row">
              <input
                type="checkbox"
                checked={projectTypes.includes(projectType.id)}
                disabled={isSaving || isAdvanced}
                onChange={(event) => {
                  const checked = event.currentTarget.checked
                  setProjectTypes((current) =>
                    checked
                      ? [...new Set([...current, projectType.id])]
                      : current.filter((item) => item !== projectType.id),
                  )
                }}
              />
              <span>{projectType.label}</span>
            </label>
          ))}
        </div>
        <Typography variant="caption" tone="muted">
          Все три типа означают общий вопрос без отдельного ограничения по объекту.
        </Typography>
      </div>

      {isAdvanced && (
        <div className="admin-qb-advanced-rule" role="status">
          <Typography variant="bodySmMedium">Сложное правило защищено</Typography>
          <Typography variant="caption" tone="muted">
            {initialState.advancedReason}
          </Typography>
        </div>
      )}

      {mode === 'exists' && (
        <Field>
          <FieldLabel htmlFor={`question-show-source-${question.id}`}>Вопрос-источник</FieldLabel>
          <select
            className="admin-qb-select"
            id={`question-show-source-${question.id}`}
            value={sourceQuestionId}
            disabled={isSaving || isAdvanced || sourceQuestions.length === 0}
            onChange={(event) => setSourceQuestionId(event.currentTarget.value)}
          >
            {sourceQuestions.length === 0 && <option value="">Нет доступных предыдущих вопросов</option>}
            {sourceQuestions.map((item) => (
              <option key={item.id} value={item.id}>{item.prompt}</option>
            ))}
          </select>
        </Field>
      )}

      {mode === 'equals' && (
        <>
          <Field>
            <FieldLabel htmlFor={`question-show-option-source-${question.id}`}>Вопрос-источник</FieldLabel>
            <select
              className="admin-qb-select"
              id={`question-show-option-source-${question.id}`}
              value={selectedOptionQuestion?.id ?? ''}
              disabled={isSaving || isAdvanced || optionQuestions.length === 0}
              onChange={(event) => {
                const nextQuestion = optionQuestions.find((item) => item.id === event.currentTarget.value)
                setOptionQuestionId(event.currentTarget.value)
                setOptionId(nextQuestion?.options?.find((option) => itemIsEnabled(option))?.id ?? '')
              }}
            >
              {optionQuestions.length === 0 && <option value="">Нет предыдущих вопросов с вариантами</option>}
              {optionQuestions.map((item) => (
                <option key={item.id} value={item.id}>{item.prompt}</option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`question-show-option-${question.id}`}>Вариант</FieldLabel>
            <select
              className="admin-qb-select"
              id={`question-show-option-${question.id}`}
              value={effectiveOptionId}
              disabled={isSaving || isAdvanced || !selectedOptionQuestion}
              onChange={(event) => setOptionId(event.currentTarget.value)}
            >
              {selectedOptionQuestionOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Button type="button" variant="outline" size="sm" disabled={isSaving || !canSave} onClick={() => void saveVisibility()}>
        <HugeiconsIcon icon={FloppyDiskIcon} strokeWidth={2} data-icon="inline-start" />
        Сохранить условие
      </Button>
    </div>
  )
}

function OptionRowEditor({
  question,
  option,
  index,
  isSaving,
  canMoveUp,
  canMoveDown,
  isDragging,
  onSave,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDrop,
  onMouseDrop,
  onPointerDragStart,
  onPointerDragEnd,
  onDragEnd,
  onToggle,
  onDelete,
}: {
  question: QuestionnaireQuestion
  option: QuestionnaireOption
  index: number
  isSaving: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  isDragging: boolean
  onSave: SaveDefinitionEdit
  onMoveUp: () => void
  onMoveDown: () => void
  onDragStart: (event: DragEvent<HTMLSpanElement>) => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onMouseDrop: () => void
  onPointerDragStart: () => void
  onPointerDragEnd: (event: PointerEvent<HTMLSpanElement>) => void
  onDragEnd: () => void
  onToggle: (checked: boolean) => void
  onDelete: () => void
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

  function deleteOption() {
    if (!window.confirm(`Удалить вариант ${option.id} из новой версии опросника?`)) return
    onDelete()
  }

  return (
    <form
      className={cn('admin-qb-option-row', !isEnabled && 'is-disabled', isDragging && 'is-dragging')}
      aria-label={`Вариант ${option.id}`}
      data-testid={`option-row-${option.id}`}
      data-qb-drop-kind="option"
      data-qb-drop-question={question.id}
      data-qb-drop-id={option.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseUp={onMouseDrop}
      onSubmit={(event) => void submit(event)}
    >
      <div className="admin-qb-option-grip">
        <DragHandle
          draggable={!isSaving}
          testId={`option-drag-${option.id}`}
          onDragStart={onDragStart}
          onPointerDown={onPointerDragStart}
          onPointerUp={onPointerDragEnd}
          onDragEnd={onDragEnd}
        />
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
        <Button type="button" variant="destructive" size="icon-xs" aria-label={`Удалить вариант ${option.id}`} disabled={isSaving} onClick={deleteOption}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
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

function DragHandle({
  draggable = false,
  testId,
  onDragStart,
  onPointerDown,
  onPointerUp,
  onDragEnd,
}: {
  draggable?: boolean
  testId?: string
  onDragStart?: (event: DragEvent<HTMLSpanElement>) => void
  onPointerDown?: () => void
  onPointerUp?: (event: PointerEvent<HTMLSpanElement>) => void
  onDragEnd?: () => void
}) {
  return (
    <span
      className="admin-drag-handle"
      aria-hidden="true"
      draggable={draggable}
      data-testid={testId}
      onDragStart={onDragStart}
      onPointerDown={onPointerDown}
      onMouseDown={onPointerDown}
      onPointerUp={onPointerUp}
      onDragEnd={onDragEnd}
    >
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

function reorderId(ids: string[], id: string, targetId: string | null) {
  const fromIndex = ids.indexOf(id)
  if (fromIndex === -1 || id === targetId) return null

  const nextIds = ids.filter((item) => item !== id)
  const targetIndex = targetId ? ids.indexOf(targetId) : ids.length
  if (targetIndex === -1) return null

  nextIds.splice(Math.min(targetIndex, nextIds.length), 0, id)
  return arraysEqual(nextIds, ids) ? null : nextIds
}

function arraysEqual(first: readonly string[], second: readonly string[]) {
  return first.length === second.length && first.every((item, index) => item === second[index])
}

function dragStateLabel(state: BuilderDragState) {
  if (state.kind === 'section') return state.sectionId
  if (state.kind === 'question') return state.questionId
  return state.optionId
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
  const kind = questionTypeKind(question)
  return questionnaireAnswerTypeOptions.find((option) => option.id === kind)?.label ?? kind
}

function questionTypeKind(question: QuestionnaireQuestion) {
  return getQuestionnaireQuestionAnswerType(question)
}

function visibilityEditorState(
  rule: QuestionnaireVisibilityRule | undefined,
  sourceQuestions: readonly QuestionnaireQuestion[],
) {
  const fallbackQuestion = sourceQuestions[0]
  const fallbackOptionQuestion = sourceQuestions.find((question) => (question.options ?? []).length > 0)
  const fallbackState = {
    mode: 'always' as VisibilityEditorMode,
    sourceQuestionId: fallbackQuestion?.id ?? '',
    optionQuestionId: fallbackOptionQuestion?.id ?? '',
    optionId: fallbackOptionQuestion?.options?.find((option) => itemIsEnabled(option))?.id ?? '',
    projectTypes: questionnaireProjectTypeOptions.map((item) => item.id),
    isAdvanced: false,
    advancedReason: '',
  }
  const parsedRule = supportedVisibilityRuleParts(rule)

  if (!parsedRule.supported) {
    return {
      ...fallbackState,
      isAdvanced: true,
      advancedReason: parsedRule.reason,
    }
  }

  const projectTypes = parsedRule.projectTypes ?? fallbackState.projectTypes

  if (parsedRule.answerRule) {
    const answerRule = parsedRule.answerRule
    const sourceQuestion = sourceQuestions.find((question) => question.id === answerRule.questionId)
    if (!sourceQuestion) {
      return {
        ...fallbackState,
        projectTypes,
        isAdvanced: true,
        advancedReason: 'Это условие зависит от вопроса ниже, отключенного или удаленного вопроса. Сохранение заблокировано, чтобы не сломать прохождение.',
      }
    }

    if (answerRule.equals?.[0]) {
      const optionId = answerRule.equals[0]
      const optionExists = sourceQuestion.options?.some((option) =>
        option.id === optionId && itemIsEnabled(option),
      )
      if (!optionExists) {
        return {
          ...fallbackState,
          projectTypes,
          isAdvanced: true,
          advancedReason: 'Это условие ссылается на отключенный или удаленный вариант. Сохранение заблокировано, чтобы не потерять исходную логику.',
        }
      }

      return {
        ...fallbackState,
        mode: 'equals' as VisibilityEditorMode,
        optionQuestionId: answerRule.questionId,
        optionId,
        projectTypes,
      }
    }

    if (answerRule.exists) {
      return {
        ...fallbackState,
        mode: 'exists' as VisibilityEditorMode,
        sourceQuestionId: answerRule.questionId,
        projectTypes,
      }
    }
  }

  return {
    ...fallbackState,
    projectTypes,
  }
}

function supportedVisibilityRuleParts(rule: QuestionnaireVisibilityRule | undefined): {
  supported: boolean
  projectTypes?: readonly QuestionnaireProjectType[]
  answerRule?: DirectVisibilityRule
  reason: string
} {
  if (!rule) return { supported: true, reason: '' }
  if ('never' in rule) {
    return {
      supported: false,
      reason: 'Это служебное правило скрытия после удаления вопроса. Его можно изменить только через отдельную миграцию.',
    }
  }
  if ('any' in rule) {
    return {
      supported: false,
      reason: 'Правило содержит альтернативные ветки. Текущий редактор показывает его, но не перезаписывает.',
    }
  }
  if ('projectTypes' in rule) return { supported: true, projectTypes: rule.projectTypes, reason: '' }
  if ('questionId' in rule) {
    if (rule.notEquals || (rule.equals && rule.equals.length !== 1)) {
      return {
        supported: false,
        reason: 'Правило содержит несколько вариантов или исключение. Текущий редактор показывает его, но не перезаписывает.',
      }
    }
    return { supported: true, answerRule: rule, reason: '' }
  }

  let projectTypes: readonly QuestionnaireProjectType[] | undefined
  let answerRule: DirectVisibilityRule | undefined

  for (const condition of rule.all) {
    const parsed = supportedVisibilityRuleParts(condition)
    if (!parsed.supported) return parsed
    if (parsed.projectTypes) {
      if (projectTypes) {
        return {
          supported: false,
          reason: 'Правило содержит несколько ограничений по типу объекта. Текущий редактор показывает его, но не перезаписывает.',
        }
      }
      projectTypes = parsed.projectTypes
    }
    if (parsed.answerRule) {
      if (answerRule) {
        return {
          supported: false,
          reason: 'Правило зависит от нескольких ответов. Текущий редактор показывает его, но не перезаписывает.',
        }
      }
      answerRule = parsed.answerRule
    }
  }

  return { supported: true, projectTypes, answerRule, reason: '' }
}

function buildVisibilityRule(input: {
  mode: VisibilityEditorMode
  sourceQuestionId: string
  optionQuestionId: string
  optionId: string
  projectTypes: readonly QuestionnaireProjectType[]
}): QuestionnaireVisibilityRule | null {
  const selectedProjectTypes = questionnaireProjectTypeOptions
    .map((item) => item.id)
    .filter((projectType) => input.projectTypes.includes(projectType))
  const rules: QuestionnaireVisibilityRule[] = []

  if (selectedProjectTypes.length > 0 && selectedProjectTypes.length < questionnaireProjectTypeOptions.length) {
    rules.push({ projectTypes: selectedProjectTypes })
  }

  if (input.mode === 'exists') {
    rules.push({ questionId: input.sourceQuestionId, exists: true })
  }

  if (input.mode === 'equals') {
    rules.push({ questionId: input.optionQuestionId, equals: [input.optionId] })
  }

  if (rules.length === 0) return null
  if (rules.length === 1) return rules[0] ?? null
  return { all: rules }
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
  if ('projectTypes' in rule) {
    return `Тип объекта: ${rule.projectTypes.map(projectTypeLabel).join(', ')}`
  }

  if (rule.exists) return `${rule.questionId}: заполнен`
  if (rule.equals?.length) return `${rule.questionId}: ${rule.equals.join(', ')}`
  if (rule.notEquals?.length) return `${rule.questionId}: не ${rule.notEquals.join(', ')}`
  return rule.questionId
}

function projectTypeLabel(projectType: QuestionnaireProjectType) {
  return questionnaireProjectTypeOptions.find((option) => option.id === projectType)?.label ?? projectType
}

function questionnaireQuestionsWithSections(record: QuestionnaireDefinitionRecord) {
  return record.sections.flatMap((section) =>
    section.questions.map((question) => ({
      section,
      question,
    })),
  )
}

function visibilityTargetsProjectType(
  rule: QuestionnaireVisibilityRule | undefined,
  projectType: QuestionnaireProjectType,
): boolean {
  if (!rule) return false
  if ('never' in rule) return false
  if ('projectTypes' in rule) return rule.projectTypes.includes(projectType)
  if ('all' in rule) return rule.all.some((condition) => visibilityTargetsProjectType(condition, projectType))
  if ('any' in rule) return rule.any.some((condition) => visibilityTargetsProjectType(condition, projectType))
  return false
}

function visibilityProjectTypeSummary(
  rule: QuestionnaireVisibilityRule | undefined,
  projectType: QuestionnaireProjectType,
): string {
  const state = visibilityProjectTypeState(rule, projectType)
  if (state === 'visible') return 'Показывается'
  if (state === 'hidden') return 'Скрыт'
  if (state === 'conditional') return 'Зависит от ответа'
  return 'Без ограничения'
}

function visibilityProjectTypeState(
  rule: QuestionnaireVisibilityRule | undefined,
  projectType: QuestionnaireProjectType,
): 'unrestricted' | 'visible' | 'hidden' | 'conditional' {
  if (!rule) return 'unrestricted'
  if ('never' in rule) return 'hidden'
  if ('projectTypes' in rule) return rule.projectTypes.includes(projectType) ? 'visible' : 'hidden'
  if ('all' in rule) {
    let hasProjectScope = false
    let hasAnswerCondition = false

    for (const condition of rule.all) {
      const state = visibilityProjectTypeState(condition, projectType)
      if (state === 'hidden') return 'hidden'
      if (state === 'visible') hasProjectScope = true
      if (state === 'conditional') hasAnswerCondition = true
    }

    if (hasProjectScope && hasAnswerCondition) return 'conditional'
    if (hasProjectScope) return 'visible'
    return hasAnswerCondition ? 'conditional' : 'unrestricted'
  }
  if ('any' in rule) return 'conditional'
  return 'conditional'
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неизвестная ошибка'
}
