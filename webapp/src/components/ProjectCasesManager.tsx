import {
  publicProjectExampleAssets,
  type ProjectExampleCreateRequest,
  type ProjectExampleRecord,
} from '@poznyak-engineering-calculator/contracts'
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type FormEvent, useMemo, useState } from 'react'

import {
  AdminPageHeader,
  AdminPanel,
  EmptyState,
  ErrorBlock,
  LoadingBlock,
  MetricTile,
  StatusPill,
} from '@/components/AdminPrimitives'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Typography } from '@/components/ui/typography'
import { numberFormatter } from '@/lib/admin-derived'
import { ApiRequestError } from '@/lib/api'
import {
  useCreateProjectCaseMutation,
  useProjectCasesQuery,
  useReorderProjectCasesMutation,
  useUpdateProjectCaseMutation,
} from '@/lib/project-cases-queries'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type FragmentFormState = {
  title: string
  caption: string
  imageUrl: string
  imageAlt: string
  sortOrder: string
}

type ProjectCaseFormState = {
  slug: string
  title: string
  description: string
  objectType: string
  location: string
  areaSqm: string
  engineeringSections: string
  initialTask: string
  solutionSummary: string
  exampleSlugs: string
  fileUrl: string
  coverImageUrl: string
  isPublic: boolean
  isArchived: boolean
  sortOrder: string
  fragments: FragmentFormState[]
}

const emptyCases: ProjectExampleRecord[] = []
const defaultFragment: FragmentFormState = {
  title: '',
  caption: '',
  imageUrl: '',
  imageAlt: '',
  sortOrder: '10',
}

export function ProjectCasesManager() {
  const auth = useAuth()
  const casesQuery = useProjectCasesQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const createCase = useCreateProjectCaseMutation({ api: auth.api })
  const updateCase = useUpdateProjectCaseMutation({ api: auth.api })
  const reorderCases = useReorderProjectCasesMutation({ api: auth.api })
  const cases = casesQuery.data?.examples ?? emptyCases
  const sortedCases = useMemo(() => sortProjectCases(cases), [cases])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingCase, setEditingCase] = useState<ProjectExampleRecord | null>(null)
  const [formState, setFormState] = useState<ProjectCaseFormState>(() => defaultFormState(10))
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)

  const publishedCount = cases.filter((item) => item.isPublic && !item.isArchived).length
  const draftCount = cases.filter((item) => !item.isPublic && !item.isArchived).length
  const archivedCount = cases.filter((item) => item.isArchived).length
  const nextSortOrder = nextProjectCaseSortOrder(sortedCases)
  const isSaving = createCase.isPending || updateCase.isPending
  const isMutating = updateCase.isPending || reorderCases.isPending

  function openCreateDrawer() {
    setEditingCase(null)
    setFormState(defaultFormState(nextSortOrder))
    setFormError(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(projectCase: ProjectExampleRecord) {
    setEditingCase(projectCase)
    setFormState(formStateFromCase(projectCase))
    setFormError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const payload = buildPayload(formState)
    if ('error' in payload) {
      setFormError(payload.error)
      return
    }

    try {
      if (editingCase) {
        await updateCase.mutateAsync({
          id: editingCase.id,
          input: payload.value,
        })
      } else {
        await createCase.mutateAsync(payload.value)
      }

      setDrawerOpen(false)
      setEditingCase(null)
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function togglePublication(projectCase: ProjectExampleRecord, isPublic: boolean) {
    if (projectCase.isArchived) return
    setActionError(null)
    setConfirmArchiveId(null)

    if (isPublic && !canPublishProjectCase(projectCase)) {
      setActionError('Чтобы опубликовать кейс, заполните описание, объект, площадь, задачу, разделы, фрагменты и хотя бы один PDF-пример.')
      return
    }

    try {
      await updateCase.mutateAsync({
        id: projectCase.id,
        input: { isPublic },
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function toggleArchive(projectCase: ProjectExampleRecord) {
    setActionError(null)

    if (!projectCase.isArchived && confirmArchiveId !== projectCase.id) {
      setConfirmArchiveId(projectCase.id)
      return
    }

    try {
      await updateCase.mutateAsync({
        id: projectCase.id,
        input: { isArchived: !projectCase.isArchived },
      })
      setConfirmArchiveId(null)
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function moveCase(projectCase: ProjectExampleRecord, direction: -1 | 1) {
    const currentIndex = sortedCases.findIndex((item) => item.id === projectCase.id)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedCases.length) return

    const reordered = [...sortedCases]
    const [removed] = reordered.splice(currentIndex, 1)
    reordered.splice(nextIndex, 0, removed)
    setActionError(null)
    setConfirmArchiveId(null)

    try {
      await reorderCases.mutateAsync({
        examples: reordered.map((item, index) => ({
          id: item.id,
          sortOrder: (index + 1) * 10,
        })),
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  return (
    <section className="admin-view" aria-labelledby="project-cases-heading">
      <AdminPageHeader
        eyebrow="Настройка продукта"
        title="Кейсы проектов"
        description="Публичные страницы реализованных проектов: обезличенные фрагменты, SEO-поля и привязка к PDF-примерам после контакта."
        actions={
          <Button type="button" onClick={openCreateDrawer}>
            Добавить кейс
          </Button>
        }
      />

      <div className="admin-priority-strip">
        <MetricTile label="Опубликованы" value={publishedCount} tone="green" />
        <MetricTile label="Черновики" value={draftCount} tone="amber" />
        <MetricTile label="Архив" value={archivedCount} tone="gray" />
      </div>

      <AdminPanel
        title="Публичный каталог кейсов"
        description="PDF не публикуется напрямую: посетитель оставляет контакт и получает доступный способ получения документов."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void casesQuery.refetch()}>
            Обновить
          </Button>
        }
      >
        <div className="admin-stack">
          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось выполнить действие с кейсом</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {casesQuery.isLoading ? (
            <LoadingBlock label="Загружаем кейсы..." />
          ) : casesQuery.isError ? (
            <ErrorBlock
              title="Не удалось загрузить кейсы"
              description={errorMessage(casesQuery.error)}
              onRetry={() => void casesQuery.refetch()}
            />
          ) : sortedCases.length === 0 ? (
            <EmptyState
              title="Кейсов пока нет"
              description="Добавьте первый обезличенный кейс, чтобы подготовить публичный каталог."
              action={
                <Button type="button" onClick={openCreateDrawer}>
                  Добавить кейс
                </Button>
              }
            />
          ) : (
            <>
              <div className="admin-table-wrap desktop-only">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Порядок</TableHead>
                      <TableHead>Кейс</TableHead>
                      <TableHead>Объект</TableHead>
                      <TableHead>Разделы</TableHead>
                      <TableHead>PDF-примеры</TableHead>
                      <TableHead>Публикация</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedCases.map((projectCase, index) => (
                      <TableRow key={projectCase.id} className={cn(projectCase.isArchived && 'bg-muted/30 text-muted-foreground')}>
                        <TableCell>
                          <ProjectCaseOrderControls
                            projectCase={projectCase}
                            index={index}
                            total={sortedCases.length}
                            disabled={isMutating}
                            onMove={moveCase}
                          />
                        </TableCell>
                        <TableCell className="min-w-[280px] whitespace-normal">
                          <ProjectCaseTitle projectCase={projectCase} />
                        </TableCell>
                        <TableCell className="min-w-[180px] whitespace-normal">
                          <ProjectCaseObject projectCase={projectCase} />
                        </TableCell>
                        <TableCell className="min-w-[180px] whitespace-normal">
                          <InlineList values={projectCase.engineeringSections} empty="Не указаны" />
                        </TableCell>
                        <TableCell>
                          <InlineList values={projectCase.exampleSlugs.map(assetLabel)} empty="Не привязаны" />
                        </TableCell>
                        <TableCell>
                          <Switch
                            aria-label={`Публиковать кейс ${projectCase.title}`}
                            checked={projectCase.isPublic && !projectCase.isArchived}
                            disabled={projectCase.isArchived || updateCase.isPending}
                            onCheckedChange={(checked) => void togglePublication(projectCase, checked)}
                          />
                        </TableCell>
                        <TableCell>
                          <ProjectCaseStatus projectCase={projectCase} />
                        </TableCell>
                        <TableCell>
                          <ProjectCaseActions
                            projectCase={projectCase}
                            confirmArchiveId={confirmArchiveId}
                            disabled={updateCase.isPending}
                            onEdit={openEditDrawer}
                            onArchive={toggleArchive}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mobile-card-list">
                {sortedCases.map((projectCase, index) => (
                  <ProjectCaseMobileCard
                    key={projectCase.id}
                    projectCase={projectCase}
                    index={index}
                    total={sortedCases.length}
                    confirmArchiveId={confirmArchiveId}
                    orderDisabled={isMutating}
                    updateDisabled={updateCase.isPending}
                    onMove={moveCase}
                    onPublicationChange={togglePublication}
                    onEdit={openEditDrawer}
                    onArchive={toggleArchive}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </AdminPanel>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="admin-drawer admin-editor-drawer admin-case-drawer" side="right">
          <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
            <SheetHeader>
              <SheetTitle>{editingCase ? 'Редактировать кейс' : 'Добавить кейс'}</SheetTitle>
              <SheetDescription>
                Публикуйте только обезличенные данные. Полные PDF выдаются только после контактной заявки.
              </SheetDescription>
            </SheetHeader>

            <div className="admin-drawer-body">
              {formError && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось сохранить кейс</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <FieldGroup className="admin-form-grid">
                <div className="admin-drawer-grid two">
                  <Field>
                    <FieldLabel htmlFor="case-title">Название</FieldLabel>
                    <Input
                      id="case-title"
                      value={formState.title}
                      onChange={(event) => setFormState({ ...formState, title: event.target.value })}
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="case-slug">Адрес страницы</FieldLabel>
                    <Input
                      id="case-slug"
                      value={formState.slug}
                      onChange={(event) => setFormState({ ...formState, slug: event.target.value })}
                      autoComplete="off"
                      placeholder="otoplenie-doma-180m"
                    />
                    <FieldDescription>Можно оставить пустым при создании: система сформирует адрес автоматически.</FieldDescription>
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="case-description">Краткое описание</FieldLabel>
                  <Textarea
                    id="case-description"
                    value={formState.description}
                    onChange={(event) => setFormState({ ...formState, description: event.target.value })}
                    rows={3}
                  />
                </Field>

                <div className="admin-drawer-grid">
                  <Field>
                    <FieldLabel htmlFor="case-object-type">Тип объекта</FieldLabel>
                    <Input
                      id="case-object-type"
                      value={formState.objectType}
                      onChange={(event) => setFormState({ ...formState, objectType: event.target.value })}
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="case-location">Локация</FieldLabel>
                    <Input
                      id="case-location"
                      value={formState.location}
                      onChange={(event) => setFormState({ ...formState, location: event.target.value })}
                      autoComplete="off"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="case-area">Площадь</FieldLabel>
                    <Input
                      id="case-area"
                      value={formState.areaSqm}
                      onChange={(event) => setFormState({ ...formState, areaSqm: event.target.value })}
                      autoComplete="off"
                      placeholder="180 м²"
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="case-sections">Разделы инженерии</FieldLabel>
                  <Textarea
                    id="case-sections"
                    value={formState.engineeringSections}
                    onChange={(event) => setFormState({ ...formState, engineeringSections: event.target.value })}
                    rows={2}
                    placeholder="ОВ, ВК, ТМ"
                  />
                  <FieldDescription>Разделяйте запятыми или новой строкой.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="case-task">Поставленная задача</FieldLabel>
                  <Textarea
                    id="case-task"
                    value={formState.initialTask}
                    onChange={(event) => setFormState({ ...formState, initialTask: event.target.value })}
                    rows={4}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="case-solution">Что решили фрагменты</FieldLabel>
                  <Textarea
                    id="case-solution"
                    value={formState.solutionSummary}
                    onChange={(event) => setFormState({ ...formState, solutionSummary: event.target.value })}
                    rows={4}
                  />
                </Field>

                <div className="admin-drawer-grid two">
                  <Field>
                    <FieldLabel htmlFor="case-file-url">Внутренняя ссылка на PDF-пример</FieldLabel>
                    <Input
                      id="case-file-url"
                      value={formState.fileUrl}
                      onChange={(event) => setFormState({ ...formState, fileUrl: event.target.value })}
                      autoComplete="off"
                      required
                    />
                    <FieldDescription>Не показывается на публичном сайте. Для выдачи используйте коды PDF-примеров ниже.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="case-cover">Обложка</FieldLabel>
                    <Input
                      id="case-cover"
                      value={formState.coverImageUrl}
                      onChange={(event) => setFormState({ ...formState, coverImageUrl: event.target.value })}
                      autoComplete="off"
                      placeholder="/landing-v4/project-preview-plan-08.jpg"
                    />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="case-assets">Коды PDF-примеров</FieldLabel>
                  <Input
                    id="case-assets"
                    value={formState.exampleSlugs}
                    onChange={(event) => setFormState({ ...formState, exampleSlugs: event.target.value })}
                    autoComplete="off"
                    placeholder="ov, vk"
                  />
                  <FieldDescription>
                    Доступные значения: {publicProjectExampleAssets.map((asset) => asset.slug).join(', ')}.
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Фрагменты документации</FieldLabel>
                  <div className="admin-case-fragments">
                    {formState.fragments.map((fragment, index) => (
                      <FragmentEditor
                        key={index}
                        index={index}
                        fragment={fragment}
                        onChange={(nextFragment) => updateFragment(index, nextFragment)}
                        onRemove={() => removeFragment(index)}
                      />
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormState({
                      ...formState,
                      fragments: [
                        ...formState.fragments,
                        { ...defaultFragment, sortOrder: String((formState.fragments.length + 1) * 10) },
                      ],
                    })}
                  >
                    Добавить фрагмент
                  </Button>
                </Field>

                <div className="admin-drawer-grid">
                  <Field>
                    <FieldLabel htmlFor="case-sort-order">Порядок</FieldLabel>
                    <Input
                      id="case-sort-order"
                      value={formState.sortOrder}
                      onChange={(event) => setFormState({ ...formState, sortOrder: event.target.value })}
                      inputMode="numeric"
                      autoComplete="off"
                      required
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <Switch
                      id="case-public"
                      checked={formState.isPublic}
                      disabled={formState.isArchived}
                      onCheckedChange={(checked) => setFormState({ ...formState, isPublic: checked })}
                    />
                    <div className="admin-field-copy">
                      <FieldLabel htmlFor="case-public">Опубликовать</FieldLabel>
                      <FieldDescription>Архивные кейсы скрыты автоматически.</FieldDescription>
                    </div>
                  </Field>
                  <Field orientation="horizontal">
                    <Switch
                      id="case-archived"
                      checked={formState.isArchived}
                      onCheckedChange={(checked) => setFormState({
                        ...formState,
                        isArchived: checked,
                        isPublic: checked ? false : formState.isPublic,
                      })}
                    />
                    <div className="admin-field-copy">
                      <FieldLabel htmlFor="case-archived">Архив</FieldLabel>
                      <FieldDescription>Архив выключает публикацию.</FieldDescription>
                    </div>
                  </Field>
                </div>
              </FieldGroup>
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Сохраняем...' : 'Сохранить кейс'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  )

  function updateFragment(index: number, fragment: FragmentFormState) {
    setFormState({
      ...formState,
      fragments: formState.fragments.map((item, itemIndex) =>
        itemIndex === index ? fragment : item,
      ),
    })
  }

  function removeFragment(index: number) {
    setFormState({
      ...formState,
      fragments: formState.fragments.filter((_, itemIndex) => itemIndex !== index),
    })
  }
}

function FragmentEditor({
  index,
  fragment,
  onChange,
  onRemove,
}: {
  index: number
  fragment: FragmentFormState
  onChange: (fragment: FragmentFormState) => void
  onRemove: () => void
}) {
  return (
    <div className="admin-case-fragment">
      <div className="admin-subpanel-head">
        <Typography variant="bodySmMedium">Фрагмент {numberFormatter.format(index + 1)}</Typography>
        <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
          Удалить
        </Button>
      </div>
      <div className="admin-drawer-grid two">
        <Field>
          <FieldLabel htmlFor={`case-fragment-title-${index}`}>Название</FieldLabel>
          <Input
            id={`case-fragment-title-${index}`}
            value={fragment.title}
            onChange={(event) => onChange({ ...fragment, title: event.target.value })}
            autoComplete="off"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`case-fragment-order-${index}`}>Порядок</FieldLabel>
          <Input
            id={`case-fragment-order-${index}`}
            value={fragment.sortOrder}
            onChange={(event) => onChange({ ...fragment, sortOrder: event.target.value })}
            inputMode="numeric"
            autoComplete="off"
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={`case-fragment-url-${index}`}>Ссылка на изображение</FieldLabel>
        <Input
          id={`case-fragment-url-${index}`}
          value={fragment.imageUrl}
          onChange={(event) => onChange({ ...fragment, imageUrl: event.target.value })}
          autoComplete="off"
          placeholder="/landing-v4/project-preview-plan-08.jpg"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`case-fragment-alt-${index}`}>Описание изображения</FieldLabel>
        <Input
          id={`case-fragment-alt-${index}`}
          value={fragment.imageAlt}
          onChange={(event) => onChange({ ...fragment, imageAlt: event.target.value })}
          autoComplete="off"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`case-fragment-caption-${index}`}>Какую задачу решает</FieldLabel>
        <Textarea
          id={`case-fragment-caption-${index}`}
          value={fragment.caption}
          onChange={(event) => onChange({ ...fragment, caption: event.target.value })}
          rows={3}
        />
      </Field>
    </div>
  )
}

function ProjectCaseOrderControls({
  projectCase,
  index,
  total,
  disabled,
  onMove,
}: {
  projectCase: ProjectExampleRecord
  index: number
  total: number
  disabled: boolean
  onMove: (projectCase: ProjectExampleRecord, direction: -1 | 1) => void | Promise<void>
}) {
  return (
    <div className="admin-order-control">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Переместить кейс ${projectCase.title} выше`}
        disabled={index === 0 || disabled}
        onClick={() => void onMove(projectCase, -1)}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Переместить кейс ${projectCase.title} ниже`}
        disabled={index === total - 1 || disabled}
        onClick={() => void onMove(projectCase, 1)}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
      </Button>
      <Typography className="numeric" variant="controlXs" tone="muted">{String(projectCase.sortOrder)}</Typography>
    </div>
  )
}

function ProjectCaseTitle({ projectCase }: { projectCase: ProjectExampleRecord }) {
  return (
    <div className="admin-case-title">
      <Typography variant="bodySmMedium">{projectCase.title}</Typography>
      <Typography className="numeric" variant="caption" tone="muted">/projects/{projectCase.slug}/</Typography>
      {projectCase.description && (
        <Typography variant="caption" tone="muted">{projectCase.description}</Typography>
      )}
    </div>
  )
}

function ProjectCaseObject({ projectCase }: { projectCase: ProjectExampleRecord }) {
  const parts = [projectCase.objectType, projectCase.areaSqm, projectCase.location].filter(Boolean)

  return (
    <div className="admin-case-title">
      <Typography variant="bodySmMedium">{parts.join(' · ') || 'Не указан'}</Typography>
      <Typography variant="caption" tone="muted">
        {projectCase.fragments.length > 0
          ? `${numberFormatter.format(projectCase.fragments.length)} фрагм.`
          : 'Фрагменты не добавлены'}
      </Typography>
    </div>
  )
}

function InlineList({ values, empty }: { values: readonly string[]; empty: string }) {
  if (values.length === 0) return <Typography variant="caption" tone="muted">{empty}</Typography>

  return (
    <div className="admin-case-pill-list">
      {values.map((value) => (
        <StatusPill key={value} tone="blue">{value}</StatusPill>
      ))}
    </div>
  )
}

function ProjectCaseStatus({ projectCase }: { projectCase: ProjectExampleRecord }) {
  if (projectCase.isArchived) return <StatusPill tone="gray">Архив</StatusPill>
  if (projectCase.isPublic) return <StatusPill tone="green">Опубликован</StatusPill>
  return <StatusPill tone="amber">Черновик</StatusPill>
}

function ProjectCaseActions({
  projectCase,
  confirmArchiveId,
  disabled,
  onEdit,
  onArchive,
}: {
  projectCase: ProjectExampleRecord
  confirmArchiveId: string | null
  disabled: boolean
  onEdit: (projectCase: ProjectExampleRecord) => void
  onArchive: (projectCase: ProjectExampleRecord) => void | Promise<void>
}) {
  return (
    <div className="admin-row-actions">
      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(projectCase)}>
        Редактировать
      </Button>
      <Button
        type="button"
        variant={confirmArchiveId === projectCase.id ? 'destructive' : 'ghost'}
        size="sm"
        disabled={disabled}
        onClick={() => void onArchive(projectCase)}
      >
        {projectCase.isArchived
          ? 'Вернуть'
          : confirmArchiveId === projectCase.id ? 'Подтвердить архив' : 'В архив'}
      </Button>
    </div>
  )
}

function ProjectCaseMobileCard({
  projectCase,
  index,
  total,
  confirmArchiveId,
  orderDisabled,
  updateDisabled,
  onMove,
  onPublicationChange,
  onEdit,
  onArchive,
}: {
  projectCase: ProjectExampleRecord
  index: number
  total: number
  confirmArchiveId: string | null
  orderDisabled: boolean
  updateDisabled: boolean
  onMove: (projectCase: ProjectExampleRecord, direction: -1 | 1) => void | Promise<void>
  onPublicationChange: (projectCase: ProjectExampleRecord, isPublic: boolean) => void | Promise<void>
  onEdit: (projectCase: ProjectExampleRecord) => void
  onArchive: (projectCase: ProjectExampleRecord) => void | Promise<void>
}) {
  return (
    <article className={cn('admin-mobile-card', projectCase.isArchived && 'is-muted')}>
      <div className="admin-mobile-card-head">
        <ProjectCaseTitle projectCase={projectCase} />
        <ProjectCaseStatus projectCase={projectCase} />
      </div>
      <div className="admin-property-grid">
        <ProjectCaseMobileFact label="Объект" value={[projectCase.objectType, projectCase.areaSqm].filter(Boolean).join(' · ') || 'Не указан'} />
        <ProjectCaseMobileFact label="Фрагменты" value={String(projectCase.fragments.length)} />
        <ProjectCaseMobileFact label="Разделы" value={projectCase.engineeringSections.join(', ') || 'Не указаны'} />
        <ProjectCaseMobileFact label="PDF-примеры" value={projectCase.exampleSlugs.map(assetLabel).join(', ') || 'Не привязаны'} />
      </div>
      <div className="admin-mobile-card-actions split">
        <div className="admin-switch-line">
          <Typography variant="bodySmMedium">Опубликовать</Typography>
          <Switch
            aria-label={`Публиковать кейс ${projectCase.title}`}
            checked={projectCase.isPublic && !projectCase.isArchived}
            disabled={projectCase.isArchived || updateDisabled}
            onCheckedChange={(checked) => void onPublicationChange(projectCase, checked)}
          />
        </div>
        <ProjectCaseOrderControls
          projectCase={projectCase}
          index={index}
          total={total}
          disabled={orderDisabled}
          onMove={onMove}
        />
        <ProjectCaseActions
          projectCase={projectCase}
          confirmArchiveId={confirmArchiveId}
          disabled={updateDisabled}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      </div>
    </article>
  )
}

function ProjectCaseMobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography variant="bodySmMedium">{value}</Typography>
    </div>
  )
}

function defaultFormState(sortOrder: number): ProjectCaseFormState {
  return {
    slug: '',
    title: '',
    description: '',
    objectType: '',
    location: '',
    areaSqm: '',
    engineeringSections: '',
    initialTask: '',
    solutionSummary: '',
    exampleSlugs: 'ov, vk',
    fileUrl: '/project-examples/private-case.pdf',
    coverImageUrl: '',
    isPublic: false,
    isArchived: false,
    sortOrder: String(sortOrder),
    fragments: [{ ...defaultFragment }],
  }
}

function formStateFromCase(projectCase: ProjectExampleRecord): ProjectCaseFormState {
  return {
    slug: projectCase.slug,
    title: projectCase.title,
    description: projectCase.description ?? '',
    objectType: projectCase.objectType ?? '',
    location: projectCase.location ?? '',
    areaSqm: projectCase.areaSqm ?? '',
    engineeringSections: projectCase.engineeringSections.join('\n'),
    initialTask: projectCase.initialTask ?? '',
    solutionSummary: projectCase.solutionSummary ?? '',
    exampleSlugs: projectCase.exampleSlugs.join(', '),
    fileUrl: projectCase.fileUrl,
    coverImageUrl: projectCase.coverImageUrl ?? '',
    isPublic: projectCase.isPublic,
    isArchived: projectCase.isArchived,
    sortOrder: String(projectCase.sortOrder),
    fragments: projectCase.fragments.length > 0
      ? projectCase.fragments.map((fragment) => ({
          title: fragment.title,
          caption: fragment.caption,
          imageUrl: fragment.imageUrl,
          imageAlt: fragment.imageAlt,
          sortOrder: String(fragment.sortOrder),
        }))
      : [{ ...defaultFragment }],
  }
}

function buildPayload(state: ProjectCaseFormState): { value: ProjectExampleCreateRequest } | { error: string } {
  const sortOrder = Number(state.sortOrder)
  if (!Number.isInteger(sortOrder) || sortOrder < -1_000_000 || sortOrder > 1_000_000) {
    return { error: 'Порядок должен быть целым числом от -1000000 до 1000000.' }
  }

  const sections = parseList(state.engineeringSections)
  const exampleSlugs = parseList(state.exampleSlugs).map((slug) => slug.toLowerCase())
  const knownAssetSlugs = new Set<string>(publicProjectExampleAssets.map((asset) => asset.slug))
  const unknownAssetSlugs = exampleSlugs.filter((slug) => !knownAssetSlugs.has(slug))

  if (unknownAssetSlugs.length > 0) {
    return { error: `Неизвестные коды PDF-примеров: ${unknownAssetSlugs.join(', ')}.` }
  }

  if (state.isPublic && !state.isArchived && exampleSlugs.length === 0) {
    return { error: 'Опубликованный кейс должен иметь хотя бы один код PDF-примера для выдачи после контакта.' }
  }

  if (state.isPublic && !state.isArchived) {
    const missingFields = [
      [state.description, 'описание'],
      [state.objectType, 'тип объекта'],
      [state.areaSqm, 'площадь'],
      [state.initialTask, 'задачу'],
    ].filter(([value]) => !String(value).trim())

    if (sections.length === 0) {
      missingFields.push(['', 'разделы инженерии'])
    }

    if (missingFields.length > 0) {
      return {
        error: `Для публикации заполните: ${missingFields.map(([, label]) => label).join(', ')}.`,
      }
    }
  }

  const fragments: ProjectExampleCreateRequest['fragments'] = []
  for (const [index, fragment] of state.fragments.entries()) {
    const hasAnyValue = [
      fragment.title,
      fragment.caption,
      fragment.imageUrl,
      fragment.imageAlt,
    ].some((value) => value.trim().length > 0)
    if (!hasAnyValue) continue

    const fragmentSortOrder = Number(fragment.sortOrder)
    if (
      !fragment.title.trim() ||
      !fragment.caption.trim() ||
      !fragment.imageUrl.trim() ||
      !fragment.imageAlt.trim() ||
      !Number.isInteger(fragmentSortOrder)
    ) {
      return { error: `Заполните название, изображение, alt, подпись и порядок для фрагмента ${index + 1}.` }
    }

    fragments.push({
      title: fragment.title,
      caption: fragment.caption,
      imageUrl: fragment.imageUrl,
      imageAlt: fragment.imageAlt,
      sortOrder: fragmentSortOrder,
    })
  }

  if (state.isPublic && !state.isArchived && fragments.length === 0) {
    return { error: 'Опубликованный кейс должен иметь хотя бы один фрагмент документации.' }
  }

  return {
    value: {
      slug: state.slug.trim() || undefined,
      title: state.title,
      description: emptyToUndefined(state.description),
      objectType: emptyToUndefined(state.objectType),
      location: emptyToUndefined(state.location),
      areaSqm: emptyToUndefined(state.areaSqm),
      engineeringSections: sections,
      initialTask: emptyToUndefined(state.initialTask),
      solutionSummary: emptyToUndefined(state.solutionSummary),
      fragments,
      exampleSlugs,
      fileUrl: state.fileUrl,
      coverImageUrl: emptyToUndefined(state.coverImageUrl),
      isPublic: state.isPublic,
      isArchived: state.isArchived,
      sortOrder,
    },
  }
}

function parseList(value: string) {
  return [...new Set(value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean))]
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function canPublishProjectCase(projectCase: ProjectExampleRecord) {
  return Boolean(
    projectCase.description?.trim() &&
      projectCase.objectType?.trim() &&
      projectCase.areaSqm?.trim() &&
      projectCase.initialTask?.trim() &&
      projectCase.engineeringSections.length > 0 &&
      projectCase.fragments.length > 0 &&
      projectCase.exampleSlugs.length > 0,
  )
}

function sortProjectCases(cases: ProjectExampleRecord[]) {
  return [...cases].sort((first, second) => {
    if (first.sortOrder !== second.sortOrder) return first.sortOrder - second.sortOrder
    return first.createdAt.localeCompare(second.createdAt)
  })
}

function nextProjectCaseSortOrder(cases: ProjectExampleRecord[]) {
  const maxSortOrder = cases.reduce((max, projectCase) => Math.max(max, projectCase.sortOrder), 0)
  return maxSortOrder + 10
}

function assetLabel(slug: string) {
  const asset = publicProjectExampleAssets.find((item) => item.slug === slug)
  return asset ? asset.code : slug
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неожиданная ошибка'
}
