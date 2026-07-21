import type {
  CalculationLineItem,
  CalculationListItem,
  CalculationRecord,
  CalculationStatus,
  ProjectExampleRequestRecord,
  TelegramDeliveryRecord,
} from '@poznyak-engineering-calculator/contracts'
import { Link } from '@tanstack/react-router'
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
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  activeStageConfigs,
  deriveTask,
  documentState,
  exchangeRateSourceLabel,
  formatArea,
  formatByn,
  formatDateTime,
  formatUsd,
  latestTelegramDelivery,
  leadSourceLabel,
  numberFormatter,
  pricingTypeLabel,
  projectRiskTone,
  projectStage,
  servicesSummary,
  stageConfig,
  statusLabels,
  statusOptions,
  telegramDeliveryTargetLabel,
  telegramStatusLabels,
} from '@/lib/admin-derived'
import { ApiRequestError, buildApiUrl } from '@/lib/api'
import {
  type LeadListFilters,
  useLeadQuery,
  useLeadsQuery,
  useProjectExampleRequestsQuery,
  useUpdateLeadMutation,
} from '@/lib/leads-queries'
import { leadPageRange } from '@/lib/leads-pagination'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type LeadFilterState = {
  status: CalculationStatus | 'all'
  search: string
  name: string
  phone: string
  createdFrom: string
  createdTo: string
}

type ProjectMode = 'board' | 'table'
type RecordTab = 'overview' | 'proposal' | 'questionnaire' | 'delivery' | 'communication' | 'documents' | 'history'

const defaultFilters: LeadFilterState = {
  status: 'all',
  search: '',
  name: '',
  phone: '',
  createdFrom: '',
  createdTo: '',
}

const recordTabs: Array<{ id: RecordTab; label: string }> = [
  { id: 'overview', label: 'Обзор' },
  { id: 'proposal', label: 'КП' },
  { id: 'questionnaire', label: 'ТЗ' },
  { id: 'delivery', label: 'Проект и сдача' },
  { id: 'communication', label: 'Коммуникация' },
  { id: 'documents', label: 'Документы' },
  { id: 'history', label: 'История' },
]

export function LeadsManager() {
  const auth = useAuth()
  const [filters, setFilters] = useState(defaultFilters)
  const [offset, setOffset] = useState(0)
  const [mode, setMode] = useState<ProjectMode>('table')
  const queryFilters = useMemo(() => filterStateToQuery(filters, offset), [filters, offset])
  const leadsQuery = useLeadsQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
    filters: queryFilters,
  })
  const projectExampleRequestsQuery = useProjectExampleRequestsQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
    limit: 25,
  })
  const updateLead = useUpdateLeadMutation({ api: auth.api })
  const [actionError, setActionError] = useState<string | null>(null)
  const leads = leadsQuery.data?.calculations ?? []
  const summary = leadsQuery.data?.summary
  const pageRange = summary
    ? leadPageRange({
        filteredCount: summary.filteredCount,
        limit: summary.limit,
        offset: summary.offset,
        renderedCount: leads.length,
      })
    : null

  async function changeStatus(lead: CalculationListItem, status: CalculationStatus) {
    setActionError(null)

    try {
      await updateLead.mutateAsync({
        id: lead.id,
        input: { status },
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  function clearFilters() {
    setFilters(defaultFilters)
    setOffset(0)
  }

  function updateFilters(nextFilters: LeadFilterState) {
    setFilters(nextFilters)
    setOffset(0)
  }

  return (
    <section className="admin-view" aria-labelledby="leads-heading">
      <AdminPageHeader
        eyebrow="Работа"
        title="Заявки"
        description="Рабочее представление заявок и проектов: канбан для ежедневной работы, таблица для поиска и массовой проверки."
        actions={
          <Button type="button" variant="outline" onClick={() => void leadsQuery.refetch()}>
            Обновить
          </Button>
        }
      />

      <div className="admin-priority-strip">
        <MetricTile label="Активные" value={summary?.activeCount ?? 0} tone="blue" />
        <MetricTile label="Новые" value={summary?.statusCounts.new ?? 0} tone="amber" />
        <MetricTile label="Договорились" value={summary?.statusCounts.won ?? 0} tone="green" />
      </div>

      <AdminPanel
        title="Заявки и проекты"
        description={
          summary
            ? `Показано ${numberFormatter.format(pageRange?.start ?? 0)}-${numberFormatter.format(pageRange?.end ?? 0)} из ${numberFormatter.format(summary.filteredCount)} · всего ${numberFormatter.format(summary.totalCount)}`
            : 'Загружаем заявки'
        }
        action={
          <div className="admin-segmented">
            <Button type="button" variant={mode === 'board' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('board')}>
              Канбан
            </Button>
            <Button type="button" variant={mode === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setMode('table')}>
              Таблица
            </Button>
          </div>
        }
      >
        <div className="admin-stack">
          <LeadFilters filters={filters} onChange={updateFilters} onClear={clearFilters} />

          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось обновить заявку</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {leadsQuery.isLoading ? (
            <LoadingBlock label="Загружаем заявки..." />
          ) : leadsQuery.isError ? (
            <ErrorBlock
              title="Не удалось загрузить заявки"
              description={errorMessage(leadsQuery.error)}
              onRetry={() => void leadsQuery.refetch()}
            />
          ) : leads.length === 0 ? (
            <EmptyState title="Заявок нет" description="Измените фильтры или дождитесь первой заявки с сайта." />
          ) : mode === 'board' ? (
            <ProjectKanban leads={leads} />
          ) : (
            <ProjectTable
              leads={leads}
              statusDisabled={updateLead.isPending}
              onStatusChange={changeStatus}
            />
          )}

          {summary && summary.filteredCount > 0 && (
            <div className="admin-pagination">
              <Typography variant="bodySm" tone="muted">
                Показано {numberFormatter.format(pageRange?.start ?? 0)}-{numberFormatter.format(pageRange?.end ?? 0)} из{' '}
                {numberFormatter.format(summary.filteredCount)}
              </Typography>
              <div className="admin-pagination-actions">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pageRange?.canGoPrevious || leadsQuery.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - summary.limit))}
                >
                  Назад
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pageRange?.canGoNext || leadsQuery.isFetching}
                  onClick={() => setOffset(offset + summary.limit)}
                >
                  Далее
                </Button>
              </div>
            </div>
          )}
        </div>
      </AdminPanel>

      <ProjectExampleRequestsPanel
        requests={projectExampleRequestsQuery.data?.requests ?? []}
        totalCount={projectExampleRequestsQuery.data?.summary.totalCount ?? 0}
        isLoading={projectExampleRequestsQuery.isLoading}
        isError={projectExampleRequestsQuery.isError}
        error={projectExampleRequestsQuery.error}
        onRefresh={() => void projectExampleRequestsQuery.refetch()}
      />
    </section>
  )
}

export function LeadDetailView({ leadId }: { leadId: string }) {
  const auth = useAuth()
  const leadQuery = useLeadQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
    id: leadId,
  })
  const updateLead = useUpdateLeadMutation({ api: auth.api })
  const lead = leadQuery.data?.calculation
  const [tab, setTab] = useState<RecordTab>('overview')
  const [actionError, setActionError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  async function changeStatus(status: CalculationStatus) {
    if (!lead) return
    setActionError(null)
    setSavedMessage(null)

    try {
      await updateLead.mutateAsync({
        id: lead.id,
        input: { status },
      })
      setSavedMessage('Статус сохранен')
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function saveNotes(notes: string) {
    if (!lead) return ''
    setActionError(null)
    setSavedMessage(null)

    try {
      const response = await updateLead.mutateAsync({
        id: lead.id,
        input: { notes },
      })
      setSavedMessage('Заметки сохранены')
      return response.calculation.notes ?? ''
    } catch (error) {
      setActionError(errorMessage(error))
      throw error
    }
  }

  if (leadQuery.isLoading) {
    return <LoadingBlock label="Загружаем карточку проекта..." />
  }

  if (leadQuery.isError) {
    return (
      <ErrorBlock
        title="Не удалось загрузить карточку"
        description={errorMessage(leadQuery.error)}
        onRetry={() => void leadQuery.refetch()}
      />
    )
  }

  if (!lead) return null

  const stage = stageConfig(projectStage(lead))
  const task = deriveTask(lead)

  return (
    <section className="admin-view admin-record-view" aria-labelledby="lead-detail-heading">
      <div className="admin-record-top">
        <div className="admin-record-head">
          <div className="admin-record-title-block">
            <Typography variant="caption" tone="muted">Проекты / {lead.id.slice(0, 8)}</Typography>
            <div className="admin-record-title-line">
              <Typography id="lead-detail-heading" className="admin-record-title" variant="h1">
                {lead.clientName}
              </Typography>
              <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
              <StatusPill tone={projectRiskTone(lead)}>{documentState(lead)}</StatusPill>
            </div>
            <div className="admin-record-meta">
              <Typography variant="caption">{lead.objectName ?? 'Объект не указан'}</Typography>
              <Typography variant="caption">{formatArea(lead.areaSqm)}</Typography>
              <Typography className="numeric" variant="caption">{formatByn(lead.totalBynRoundedRubles)}</Typography>
              <Typography variant="caption">{formatDateTime(lead.createdAt)}</Typography>
            </div>
          </div>
          <div className="admin-record-actions">
            <Button asChild type="button" variant="outline" size="sm">
              <Link to="/app/leads">Назад к списку</Link>
            </Button>
            <ProposalLink
              lead={lead}
              preferredLabel={hasPdfArtifact(lead.proposalArtifacts[0]) ? 'Открыть PDF' : 'Открыть КП'}
            />
          </div>
        </div>
        <Journey currentStage={projectStage(lead)} />
      </div>

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось обновить заявку</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {savedMessage && (
        <Alert>
          <AlertTitle>{savedMessage}</AlertTitle>
          <AlertDescription>Последние изменения в админке сохранены.</AlertDescription>
        </Alert>
      )}

      <div className="admin-next-action-bar">
        <div className="admin-next-action-copy">
          <Typography className="admin-eyebrow" variant="caption">Следующее действие</Typography>
          <Typography variant="bodySmMedium">{task.title}</Typography>
          <Typography variant="caption" tone="muted">{task.detail}</Typography>
        </div>
        <StatusPill tone={task.tone === 'overdue' ? 'red' : task.tone === 'today' ? 'amber' : 'blue'}>
          {task.dueLabel}
        </StatusPill>
        <Button type="button" variant="outline" size="sm" disabled>
          Выполнить
        </Button>
      </div>

      <div className="admin-record-layout">
        <div className="admin-stack">
          <div className="admin-record-tabs" role="tablist" aria-label="Разделы карточки проекта">
            {recordTabs.map((item) => (
              <Button
                key={item.id}
                type="button"
                variant={tab === item.id ? 'default' : 'ghost'}
                size="sm"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {tab === 'overview' && <ProjectOverview lead={lead} />}
          {tab === 'proposal' && <ProposalTab lead={lead} />}
          {tab === 'questionnaire' && <QuestionnaireDraftCard questionnaire={lead.questionnaire} />}
          {tab === 'delivery' && <DeliveryTab lead={lead} />}
          {tab === 'communication' && <CommunicationTab lead={lead} />}
          {tab === 'documents' && <DocumentsTab lead={lead} />}
          {tab === 'history' && <HistoryTab lead={lead} />}
        </div>

        <aside className="admin-stack">
          <AdminPanel title="Клиент и статус" description={`Обновлен ${formatDateTime(lead.updatedAt)}`}>
            <div className="admin-property-grid single">
              <DetailItem label="Телефон" value={lead.clientPhone} />
              <DetailItem label="Источник" value={leadSourceLabel(lead.source)} />
              <DetailItem label="Статус обновлен" value={formatDateTime(lead.statusUpdatedAt)} />
            </div>
            <div className="admin-field-block">
              <Field>
                <FieldLabel>Статус заявки</FieldLabel>
                <LeadStatusSelect
                  value={lead.status}
                  label="Статус заявки"
                  disabled={updateLead.isPending}
                  onChange={(status) => void changeStatus(status)}
                />
              </Field>
            </div>
          </AdminPanel>

          <AdminPanel title="Внутренние заметки">
            <LeadNotesForm
              key={`${lead.id}-${lead.notes ?? ''}`}
              initialNotes={lead.notes ?? ''}
              isSaving={updateLead.isPending}
              onSave={saveNotes}
            />
          </AdminPanel>

          <AdminPanel title="Telegram-доставка">
            <TelegramDeliveryLog deliveries={lead.telegramDeliveries} />
          </AdminPanel>
        </aside>
      </div>
    </section>
  )
}

function LeadNotesForm({
  initialNotes,
  isSaving,
  onSave,
}: {
  initialNotes: string
  isSaving: boolean
  onSave: (notes: string) => Promise<string>
}) {
  const [notesValue, setNotesValue] = useState(initialNotes)

  async function submitNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const savedNotes = await onSave(notesValue)
      setNotesValue(savedNotes)
    } catch {
      // The parent renders the API error; keep the user's draft in the textarea.
    }
  }

  return (
    <form className="admin-notes-form" onSubmit={(event) => void submitNotes(event)}>
      <Field>
        <FieldLabel htmlFor="lead-notes">Внутренние заметки</FieldLabel>
        <Textarea
          id="lead-notes"
          name="notes"
          value={notesValue}
          rows={8}
          onChange={(event) => setNotesValue(event.currentTarget.value)}
        />
      </Field>
      <Button type="submit" disabled={isSaving}>
        Сохранить заметки
      </Button>
    </form>
  )
}

function ProjectKanban({ leads }: { leads: CalculationListItem[] }) {
  return (
    <div className="admin-kanban-wrap" aria-label="Канбан проектов">
      <div className="admin-kanban">
        {activeStageConfigs.map((stage) => {
          const stageLeads = leads.filter((lead) => projectStage(lead) === stage.id)
          const sorted = [...stageLeads].sort((first, second) => {
            const firstTask = deriveTask(first)
            const secondTask = deriveTask(second)
            return new Date(firstTask.dueAt).getTime() - new Date(secondTask.dueAt).getTime()
          })

          return (
            <section key={stage.id} className="admin-kanban-col" aria-label={stage.label}>
              <div className="admin-kanban-head">
                <div className="admin-kanban-title">
                  <span className={`admin-stage-dot tone-${stage.tone}`} aria-hidden="true" />
                  <Typography variant="bodySmMedium">{stage.label}</Typography>
                </div>
                <StatusPill tone="gray">{String(stageLeads.length)}</StatusPill>
              </div>
              <div className="admin-kanban-body">
                {sorted.length === 0 ? (
                  <div className="admin-kanban-empty">
                    <Typography variant="caption" tone="muted">Нет проектов</Typography>
                  </div>
                ) : (
                  sorted.map((lead) => <ProjectCard key={lead.id} lead={lead} />)
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function ProjectCard({ lead }: { lead: CalculationListItem }) {
  const task = deriveTask(lead)

  return (
    <Link className="admin-project-card" to="/app/leads/$leadId" params={{ leadId: lead.id }}>
      <div className="admin-project-card-head">
        <div className="admin-project-card-title">
          <Typography variant="bodySmMedium">{lead.clientName}</Typography>
          <Typography variant="caption" tone="muted">
            {lead.objectName ?? 'Объект не указан'} · {formatArea(lead.areaSqm)}
          </Typography>
        </div>
        <Typography className="numeric" variant="bodySmMedium">{formatByn(lead.totalBynRoundedRubles)}</Typography>
      </div>
      <div className="admin-project-card-state">
        <Typography variant="caption" tone="muted">Состояние</Typography>
        <Typography variant="bodySmMedium">{documentState(lead)}</Typography>
      </div>
      <div className="admin-project-card-foot">
        <span className={cn('admin-action-signal', `tone-${task.tone === 'overdue' ? 'red' : task.tone === 'today' ? 'amber' : 'blue'}`)} aria-hidden="true" />
        <Typography variant="caption">{task.title} · {task.dueLabel}</Typography>
      </div>
    </Link>
  )
}

function ProjectTable({
  leads,
  statusDisabled,
  onStatusChange,
}: {
  leads: CalculationListItem[]
  statusDisabled: boolean
  onStatusChange: (lead: CalculationListItem, status: CalculationStatus) => void | Promise<void>
}) {
  return (
    <>
      <div className="admin-table-wrap desktop-only">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Клиент и ID проекта</TableHead>
              <TableHead>Объект</TableHead>
              <TableHead>Макроэтап</TableHead>
              <TableHead>Текущее состояние</TableHead>
              <TableHead>Сумма</TableHead>
              <TableHead>Следующее действие</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>КП/PDF</TableHead>
              <TableHead>Telegram</TableHead>
              <TableHead className="text-right">Карточка</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((lead) => {
              const stage = stageConfig(projectStage(lead))
              const task = deriveTask(lead)

              return (
                <TableRow key={lead.id} className={cn(lead.status === 'spam_test' && 'bg-muted/30 text-muted-foreground')}>
                  <TableCell className="min-w-[190px] whitespace-normal">
                    <LeadClientSummary lead={lead} />
                  </TableCell>
                  <TableCell className="min-w-[180px] whitespace-normal">
                    <Typography variant="bodySmMedium">{lead.objectName ?? 'Объект не указан'}</Typography>
                    <Typography variant="caption" tone="muted">{formatArea(lead.areaSqm)} · {servicesSummary(lead.serviceSnapshots)}</Typography>
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
                  </TableCell>
                  <TableCell className="min-w-[170px] whitespace-normal">{documentState(lead)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Typography className="numeric" variant="bodySmMedium">{formatByn(lead.totalBynRoundedRubles)}</Typography>
                    <Typography className="numeric" variant="caption" tone="muted">{formatUsd(lead.totalUsdCents)}</Typography>
                  </TableCell>
                  <TableCell className="min-w-[180px] whitespace-normal">
                    <Typography variant="bodySmMedium">{task.title}</Typography>
                    <Typography className={cn('admin-due', `tone-${task.tone === 'overdue' ? 'red' : task.tone === 'today' ? 'amber' : 'blue'}`)} variant="caption">
                      {task.dueLabel}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <LeadStatusSelect
                      value={lead.status}
                      label={`Статус заявки ${lead.clientName}`}
                      disabled={statusDisabled}
                      onChange={(status) => void onStatusChange(lead, status)}
                    />
                  </TableCell>
                  <TableCell>
                    <ProposalLink lead={lead} />
                  </TableCell>
                  <TableCell>
                    <TelegramDeliverySummary deliveries={lead.telegramDeliveries} compact />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild type="button" variant="outline" size="sm">
                      <Link to="/app/leads/$leadId" params={{ leadId: lead.id }}>
                        Открыть
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mobile-card-list">
        {leads.map((lead) => (
          <LeadMobileCard
            key={lead.id}
            lead={lead}
            statusDisabled={statusDisabled}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>
    </>
  )
}

function LeadMobileCard({
  lead,
  statusDisabled,
  onStatusChange,
}: {
  lead: CalculationListItem
  statusDisabled: boolean
  onStatusChange: (lead: CalculationListItem, status: CalculationStatus) => void | Promise<void>
}) {
  const stage = stageConfig(projectStage(lead))
  const task = deriveTask(lead)

  return (
    <article className="admin-mobile-card">
      <div className="admin-mobile-card-head">
        <LeadClientSummary lead={lead} />
        <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
      </div>
      <div className="admin-property-grid">
        <DetailItem label="Объект" value={lead.objectName ?? 'Не указан'} />
        <DetailItem label="Площадь" value={formatArea(lead.areaSqm)} />
        <DetailItem label="Сумма" value={`${formatByn(lead.totalBynRoundedRubles)} · ${formatUsd(lead.totalUsdCents)}`} />
        <DetailItem label="Действие" value={`${task.title} · ${task.dueLabel}`} />
        <div className="admin-detail-item">
          <Typography variant="caption" tone="muted">Telegram</Typography>
          <TelegramDeliverySummary deliveries={lead.telegramDeliveries} compact />
        </div>
      </div>
      <div className="admin-mobile-card-actions">
        <LeadStatusSelect
          value={lead.status}
          label={`Статус заявки ${lead.clientName}`}
          disabled={statusDisabled}
          onChange={(status) => void onStatusChange(lead, status)}
        />
        <ProposalLink lead={lead} />
        <Button asChild type="button" variant="outline" size="sm">
          <Link to="/app/leads/$leadId" params={{ leadId: lead.id }}>
            Открыть
          </Link>
        </Button>
      </div>
    </article>
  )
}

function ProjectOverview({ lead }: { lead: CalculationRecord }) {
  return (
    <div className="admin-stack">
      <AdminPanel title="Процессные блоки" description="Карточка объединяет текущие данные, ТЗ, КП и документы проекта.">
        <div className="admin-process-grid">
          <ProcessCard
            title="КП"
            status={proposalProcessStatus(lead)}
            meta={proposalMeta(lead)}
            tone={lead.proposalArtifacts[0] ? 'green' : 'gray'}
          />
          <ProcessCard title="ТЗ" status={lead.questionnaire ? `${lead.questionnaire.progress.completionPercent}%` : 'Не начато'} meta={lead.questionnaire ? 'Заполнено через опросник' : 'Ожидает заполнения'} tone={lead.questionnaire ? 'amber' : 'gray'} />
          <ProcessCard title="Договор" status="Вручную" meta="Отдельный документный этап" tone="violet" />
          <ProcessCard title="Проект и сдача" status="Вручную" meta="Контроль выдачи ведется вручную" tone="orange" />
        </div>
      </AdminPanel>

      <AdminPanel title="Сохраненный расчет" description={`Курс ${lead.exchangeRate.usdToBynRate} BYN/USD · ${exchangeRateSourceLabel(lead.exchangeRate.source)}`}>
        <div className="admin-lines">
          {lead.calculationSnapshot.lineItems.map((lineItem) => (
            <CalculationLine key={lineItem.serviceId} lineItem={lineItem} />
          ))}
        </div>
        <div className="admin-total-row">
          <Typography variant="bodySmMedium">Итого</Typography>
          <Typography className="numeric" variant="bodySmMedium">
            {formatByn(lead.totalBynRoundedRubles)} · {formatUsd(lead.totalUsdCents)}
          </Typography>
        </div>
      </AdminPanel>
    </div>
  )
}

function ProposalTab({ lead }: { lead: CalculationRecord }) {
  const firstArtifact = lead.proposalArtifacts[0]

  return (
    <AdminPanel
      title="Коммерческое предложение"
      description="Ссылки ведут на сохраненные КП и PDF, созданные для этой заявки."
      action={<ProposalLink lead={lead} preferredLabel={hasPdfArtifact(firstArtifact) ? 'Открыть PDF' : 'Открыть КП'} />}
    >
      <div className="admin-property-grid">
        <DetailItem label="КП" value={firstArtifact?.offerNumber ?? 'Не создано'} />
        <DetailItem label="Формат КП" value={firstArtifact ? proposalArtifactFormat(firstArtifact) : 'Нет'} />
        <DetailItem label="Статус документа" value={firstArtifact ? proposalArtifactStatusLabel(firstArtifact) : 'Нет'} />
        <DetailItem label="Создано" value={firstArtifact ? formatDateTime(firstArtifact.createdAt) : 'Нет'} />
      </div>
      <div className="admin-lines">
        {lead.serviceSnapshots.map((service) => (
          <div key={service.id} className="admin-line-row">
            <div className="admin-line-main">
              <Typography variant="bodySmMedium">{service.title}</Typography>
              <Typography variant="caption" tone="muted">{pricingTypeLabel(service.pricingType)} · сохраненная услуга</Typography>
            </div>
            <Typography className="numeric" variant="bodySmMedium">{formatUsd(service.priceUsdCents)}</Typography>
          </div>
        ))}
      </div>
    </AdminPanel>
  )
}

function DeliveryTab({ lead }: { lead: CalculationRecord }) {
  return (
    <div className="admin-stack">
      <AdminPanel title="Матрица требований" description="Проверка требований по ТЗ и проекту.">
        <div className="admin-requirement-grid">
          <MetricTile label="Требования" value={lead.questionnaire?.progress.answeredCount ?? 0} tone="blue" caption="из ТЗ" />
          <MetricTile label="Без подтверждения" value={lead.questionnaire?.progress.answeredCount ?? 0} tone="amber" caption="требуют проверки" />
          <MetricTile label="Проверено" value={0} tone="gray" caption="после проверки" />
        </div>
      </AdminPanel>

      <AdminPanel title="Чек-лист завершения" description="Контрольные пункты перед выдачей проекта.">
        <div className="admin-checklist">
          {[
            ['Комплектность документации', 'Проверка всех разделов по согласованному КП'],
            ['Соответствие ТЗ и договоренностям', 'Требуется матрица требований и подтверждений'],
            ['Выдача проекта без спецификаций', 'Отдельный пакет до финальной оплаты'],
            ['Финальная оплата и спецификации', 'Разблокировка после подтверждения оплаты'],
          ].map(([title, description]) => (
            <div key={title} className="admin-check-row">
              <div className="admin-task-check" aria-hidden="true" />
              <div>
                <Typography variant="bodySmMedium">{title}</Typography>
                <Typography variant="caption" tone="muted">{description}</Typography>
              </div>
              <StatusPill tone="gray">К проверке</StatusPill>
            </div>
          ))}
        </div>
      </AdminPanel>
    </div>
  )
}

function CommunicationTab({ lead }: { lead: CalculationRecord }) {
  return (
    <AdminPanel title="Коммуникация" description="Показывает выдачу документов в Telegram и менеджерские заметки.">
      <div className="admin-stack">
        <TelegramDeliveryLog deliveries={lead.telegramDeliveries} />
        <div className="admin-notice">
          <Typography variant="bodySmMedium">Заметки менеджера</Typography>
          <Typography variant="bodySm" tone="muted">{lead.notes || 'Заметок пока нет.'}</Typography>
        </div>
      </div>
    </AdminPanel>
  )
}

function DocumentsTab({ lead }: { lead: CalculationRecord }) {
  return (
    <AdminPanel title="Документы" description="Сохраненные КП/PDF и документы проекта.">
      <div className="admin-lines">
        {lead.proposalArtifacts.map((artifact) => (
          <div key={artifact.id} className="admin-line-row">
            <div className="admin-line-main">
              <Typography variant="bodySmMedium">{artifact.offerNumber}</Typography>
              <Typography variant="caption" tone="muted">{proposalArtifactSummary(artifact)}</Typography>
            </div>
            <ProposalLink lead={{ clientName: lead.clientName, proposalArtifacts: [artifact] }} />
          </div>
        ))}
        <div className="admin-line-row muted">
          <div className="admin-line-main">
            <Typography variant="bodySmMedium">Договор / проект / спецификации</Typography>
            <Typography variant="caption" tone="muted">Оформляется вручную по проекту.</Typography>
          </div>
          <StatusPill tone="gray">Вручную</StatusPill>
        </div>
      </div>
    </AdminPanel>
  )
}

function HistoryTab({ lead }: { lead: CalculationRecord }) {
  return (
    <AdminPanel title="История" description="Ключевые события по заявке и коммерческому предложению.">
      <div className="admin-timeline">
        <HistoryItem title="Заявка создана" value={formatDateTime(lead.createdAt)} />
        <HistoryItem title="Статус обновлен" value={`${statusLabels[lead.status]} · ${formatDateTime(lead.statusUpdatedAt)}`} />
        <HistoryItem title="КП создано" value={lead.proposalArtifacts[0] ? formatDateTime(lead.proposalArtifacts[0].createdAt) : 'Нет документа'} />
        <HistoryItem title="Последнее обновление карточки" value={formatDateTime(lead.updatedAt)} />
      </div>
    </AdminPanel>
  )
}

function QuestionnaireDraftCard({
  questionnaire,
}: {
  questionnaire: CalculationRecord['questionnaire']
}) {
  if (!questionnaire) {
    return (
      <AdminPanel title="Черновик ТЗ" description="Подробный опросник для этой заявки еще не заполнен.">
        <EmptyState title="Ответов пока нет" description="Черновик ТЗ появится здесь после заполнения публичного опросника." />
      </AdminPanel>
    )
  }

  return (
    <AdminPanel
      title="Черновик ТЗ"
      description={`${questionnaire.progress.answeredCount} из ${questionnaire.progress.totalQuestions} активных вопросов · источник обновлен ${questionnaire.definitionUpdatedAt} · карточка обновлена ${formatDateTime(questionnaire.updatedAt)}`}
      action={<StatusPill tone="amber">{`${questionnaire.progress.completionPercent}%`}</StatusPill>}
    >
      <div className="admin-requirement-grid">
        <MetricTile label="Заполнено" value={`${questionnaire.progress.answeredCount}/${questionnaire.progress.totalQuestions}`} tone="blue" />
        <MetricTile label="Свои ответы" value={questionnaire.progress.customCount} tone="green" />
        <MetricTile label="Нужно уточнить" value={questionnaire.progress.unknownCount + questionnaire.progress.skippedCount} tone="amber" />
        <MetricTile
          label="Скрытые ветки"
          value={questionnaire.sections.flatMap((section) => section.questions).filter((question) => question.answer && !question.answer.isActive).length}
          tone="gray"
        />
      </div>
      <Typography variant="caption" tone="muted">
        Источник логики: {questionnaire.definitionSource}. {questionnaire.sourcePolicy}
      </Typography>
      <div className="admin-stack">
        {questionnaire.sections.map((section) => (
          <QuestionnaireSectionDraft key={section.id} section={section} />
        ))}
      </div>
    </AdminPanel>
  )
}

function QuestionnaireSectionDraft({
  section,
}: {
  section: NonNullable<CalculationRecord['questionnaire']>['sections'][number]
}) {
  const answeredQuestions = section.questions.filter(hasQuestionnaireAnswer)
  const activeQuestionCount = section.questions.filter((question) => question.isActive).length
  const activeAnsweredQuestionCount = section.questions.filter(
    (question) => question.isActive && question.answer?.isActive,
  ).length

  return (
    <section className="admin-subpanel" aria-label={section.title}>
      <div className="admin-subpanel-head">
        <Typography variant="bodySmMedium">{section.title}</Typography>
        <Typography variant="caption" tone="muted">{activeAnsweredQuestionCount}/{activeQuestionCount} активных</Typography>
      </div>
      {answeredQuestions.length === 0 ? (
        <Typography variant="bodySm" tone="muted">В этом разделе пока нет ответов.</Typography>
      ) : (
        <div className="admin-stack compact">
          {answeredQuestions.map((question) => (
            <div key={question.id} className="admin-answer-row">
              <Typography variant="caption" tone="muted">{question.prompt}</Typography>
              <div className="admin-answer-content">
                <QuestionnaireAnswerBadge answer={question.answer} />
                <Typography className="break-words" variant="bodySmMedium">
                  {questionnaireAnswerText(question.answer)}
                </Typography>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

type QuestionnaireDraftQuestion =
  NonNullable<CalculationRecord['questionnaire']>['sections'][number]['questions'][number]

type AnsweredQuestionnaireDraftQuestion = QuestionnaireDraftQuestion & {
  answer: NonNullable<QuestionnaireDraftQuestion['answer']>
}

function hasQuestionnaireAnswer(
  question: QuestionnaireDraftQuestion,
): question is AnsweredQuestionnaireDraftQuestion {
  return question.answer !== null
}

function QuestionnaireAnswerBadge({
  answer,
}: {
  answer: NonNullable<
    NonNullable<CalculationRecord['questionnaire']>['sections'][number]['questions'][number]['answer']
  >
}) {
  if (!answer.isActive) return <StatusPill tone="gray">Скрытая ветка</StatusPill>
  if (answer.kind === 'unknown') return <StatusPill tone="amber">Пока не знаю</StatusPill>
  if (answer.kind === 'skipped') return <StatusPill tone="amber">Нужно уточнить</StatusPill>
  if (answer.kind === 'custom') return <StatusPill tone="blue">Свой ответ</StatusPill>
  if (answer.optionId === 'UNKNOWN') return <StatusPill tone="amber">Нужно уточнить</StatusPill>
  return <StatusPill tone="green">Вариант</StatusPill>
}

function questionnaireAnswerText(
  answer: NonNullable<
    NonNullable<CalculationRecord['questionnaire']>['sections'][number]['questions'][number]['answer']
  >,
) {
  if (!answer.isActive) {
    const value = answer.label ?? answer.customText ?? answer.optionId ?? 'ответ сохранен'
    return `Сохранено из скрытой сейчас ветки: ${value}`
  }
  if (answer.kind === 'unknown' || answer.optionId === 'UNKNOWN') return 'Нужно уточнить до финального расчета'
  if (answer.kind === 'skipped') return 'Клиент пропустил вопрос, требуется уточнение'
  return answer.label ?? answer.customText ?? answer.optionId ?? 'Ответ сохранен'
}

function LeadFilters({
  filters,
  onChange,
  onClear,
}: {
  filters: LeadFilterState
  onChange: (filters: LeadFilterState) => void
  onClear: () => void
}) {
  return (
    <FieldGroup className="admin-filter-grid">
      <Field>
        <FieldLabel htmlFor="lead-search">Поиск</FieldLabel>
        <Input
          id="lead-search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Имя или телефон"
        />
      </Field>
      <Field>
        <FieldLabel>Статус</FieldLabel>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onChange({
              ...filters,
              status: value === 'all' ? 'all' : calculationStatus(value),
            })
          }
        >
          <SelectTrigger aria-label="Фильтр по статусу" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="lead-name">Имя</FieldLabel>
        <Input
          id="lead-name"
          value={filters.name}
          onChange={(event) => onChange({ ...filters, name: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="lead-phone">Телефон</FieldLabel>
        <Input
          id="lead-phone"
          value={filters.phone}
          onChange={(event) => onChange({ ...filters, phone: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="lead-created-from">С даты</FieldLabel>
        <Input
          id="lead-created-from"
          type="date"
          value={filters.createdFrom}
          onChange={(event) => onChange({ ...filters, createdFrom: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="lead-created-to">По дату</FieldLabel>
        <Input
          id="lead-created-to"
          type="date"
          value={filters.createdTo}
          onChange={(event) => onChange({ ...filters, createdTo: event.target.value })}
        />
      </Field>
      <div className="admin-filter-action">
        <Button type="button" variant="outline" onClick={onClear}>
          Сбросить
        </Button>
      </div>
    </FieldGroup>
  )
}

function LeadStatusSelect({
  value,
  label,
  disabled,
  onChange,
}: {
  value: CalculationStatus
  label: string
  disabled: boolean
  onChange: (status: CalculationStatus) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(calculationStatus(next))} disabled={disabled}>
      <SelectTrigger aria-label={label} className="w-full min-w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {statusOptions.map((status) => (
          <SelectItem key={status} value={status}>
            {statusLabels[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ProjectExampleRequestsPanel({
  requests,
  totalCount,
  isLoading,
  isError,
  error,
  onRefresh,
}: {
  requests: ProjectExampleRequestRecord[]
  totalCount: number
  isLoading: boolean
  isError: boolean
  error: unknown
  onRefresh: () => void
}) {
  return (
    <AdminPanel
      title="Запросы примеров проектов"
      description={
        totalCount > 0
          ? `Последние ${numberFormatter.format(requests.length)} из ${numberFormatter.format(totalCount)}`
          : 'Отдельный поток лидов, которые запросили PDF-примеры после контакта'
      }
      action={
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          Обновить
        </Button>
      }
    >
      {isLoading ? (
        <LoadingBlock label="Загружаем запросы примеров..." />
      ) : isError ? (
        <ErrorBlock title="Не удалось загрузить запросы примеров" description={errorMessage(error)} onRetry={onRefresh} />
      ) : requests.length === 0 ? (
        <EmptyState title="Запросов примеров пока нет" description="Когда посетитель оставит контакт ради PDF-примера, заявка появится здесь." />
      ) : (
        <div className="admin-compact-list">
          {requests.map((request) => (
            <div key={request.id} className="admin-example-request-row">
              <div className="admin-compact-main">
                <Typography variant="bodySmMedium">{request.clientName}</Typography>
                <Typography className="numeric" variant="caption" tone="muted">
                  {formatDateTime(request.createdAt)} · {request.clientPhone}
                </Typography>
                <TelegramDeliveryLog deliveries={request.telegramDeliveries} />
              </div>
              <div className="admin-example-actions">
                {request.requestedExamples.map((example) => (
                  <Button key={example.slug} asChild type="button" variant="outline" size="sm">
                    <a
                      href={buildApiUrl(example.urlPath)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Открыть ${example.title} для ${request.clientName}`}
                    >
                      <Typography as="span" variant="control">{example.code} PDF</Typography>
                    </a>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminPanel>
  )
}

function LeadClientSummary({ lead }: { lead: Pick<CalculationListItem, 'id' | 'clientName' | 'clientPhone' | 'createdAt'> }) {
  return (
    <div className="admin-client-cell">
      <Typography variant="bodySmMedium">{lead.clientName}</Typography>
      <Typography className="numeric" variant="caption" tone="muted">
        {lead.id.slice(0, 8)} · {lead.clientPhone}
      </Typography>
      <Typography variant="caption" tone="muted">{formatDateTime(lead.createdAt)}</Typography>
    </div>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography className="numeric" variant="bodySmMedium">{value}</Typography>
    </div>
  )
}

function ProposalLink({
  lead,
  preferredLabel,
}: {
  lead: Pick<CalculationListItem, 'clientName' | 'proposalArtifacts'>
  preferredLabel?: string
}) {
  const artifact = lead.proposalArtifacts[0]
  if (!artifact) return <Typography variant="bodySm" tone="muted">Нет КП</Typography>
  const label = preferredLabel ?? proposalButtonLabel(artifact)
  const ariaLabel = hasPdfArtifact(artifact)
    ? `Открыть PDF для ${lead.clientName}`
    : `Открыть КП для ${lead.clientName}`

  return (
    <Button asChild type="button" variant="ghost" size="sm">
      <a
        href={proposalHref(artifact)}
        target="_blank"
        rel="noreferrer"
        aria-label={ariaLabel}
      >
        <Typography as="span" variant="control">{label}</Typography>
      </a>
    </Button>
  )
}

function TelegramDeliverySummary({
  deliveries,
  compact = false,
}: {
  deliveries: readonly TelegramDeliveryRecord[]
  compact?: boolean
}) {
  const latest = latestTelegramDelivery(deliveries)
  if (!latest) return <Typography variant="bodySm" tone="muted">Нет логов</Typography>

  return (
    <div className={cn('admin-telegram-summary', compact && 'compact')}>
      <StatusPill tone={telegramTone(latest.status)}>{telegramStatusLabels[latest.status]}</StatusPill>
      {!compact && <Typography variant="caption" tone="muted">{telegramDeliveryMeta(latest)}</Typography>}
    </div>
  )
}

function TelegramDeliveryLog({ deliveries }: { deliveries: readonly TelegramDeliveryRecord[] }) {
  if (deliveries.length === 0) {
    return <Typography variant="bodySm" tone="muted">Telegram-доставок пока нет.</Typography>
  }

  return (
    <div className="admin-telegram-log">
      {deliveries.map((delivery) => (
        <div key={delivery.id} className="admin-telegram-row">
          <div className="admin-telegram-main">
            <Typography variant="bodySmMedium">{telegramDeliveryTargetLabel(delivery.targetType)}</Typography>
            <Typography variant="caption" tone="muted">{telegramRecipientLabel(delivery)}</Typography>
            {telegramDeliveryStatusDetail(delivery) && (
              <Typography variant="caption" tone="muted">{telegramDeliveryStatusDetail(delivery)}</Typography>
            )}
          </div>
          <div className="admin-telegram-meta">
            <StatusPill tone={telegramTone(delivery.status)}>{telegramStatusLabels[delivery.status]}</StatusPill>
            <Typography variant="caption" tone="muted">{telegramDeliveryMeta(delivery)}</Typography>
          </div>
        </div>
      ))}
    </div>
  )
}

function CalculationLine({ lineItem }: { lineItem: CalculationLineItem }) {
  return (
    <div className="admin-line-row">
      <div className="admin-line-main">
        <Typography variant="bodySmMedium">{lineItem.serviceSnapshot.title}</Typography>
        {lineItem.serviceSnapshot.description && (
          <Typography variant="caption" tone="muted">{lineItem.serviceSnapshot.description}</Typography>
        )}
        <Typography variant="caption" tone="muted">{linePricingLabel(lineItem)}</Typography>
      </div>
      <div className="admin-line-amounts">
        <Typography className="numeric" variant="bodySmMedium">{formatUsd(lineItem.totalUsdCents)}</Typography>
        <Typography className="numeric" variant="bodySmMedium">{formatByn(lineItem.totalBynRoundedRubles)}</Typography>
      </div>
    </div>
  )
}

function Journey({ currentStage }: { currentStage: ReturnType<typeof projectStage> }) {
  const index = activeStageConfigs.findIndex((stage) => stage.id === currentStage)

  return (
    <div className="admin-journey" aria-label="Путь проекта">
      {activeStageConfigs.map((stage, stageIndex) => (
        <div
          key={stage.id}
          className={cn('admin-journey-step', stageIndex < index && 'is-done', stageIndex === index && 'is-current')}
        >
          <Typography variant="caption" tone="muted">{`Шаг ${stageIndex + 1}`}</Typography>
          <Typography variant="controlXs">{stage.shortLabel}</Typography>
        </div>
      ))}
    </div>
  )
}

function ProcessCard({
  title,
  status,
  meta,
  tone,
}: {
  title: string
  status: string
  meta: string
  tone: Parameters<typeof StatusPill>[0]['tone']
}) {
  return (
    <article className="admin-process-card">
      <div className="admin-process-top">
        <div>
          <Typography variant="bodySmMedium">{title}</Typography>
          <Typography variant="caption" tone="muted">{meta}</Typography>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>
    </article>
  )
}

function HistoryItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="admin-history-item">
      <div className="admin-history-dot" aria-hidden="true" />
      <div>
        <Typography variant="bodySmMedium">{title}</Typography>
        <Typography variant="caption" tone="muted">{value}</Typography>
      </div>
    </div>
  )
}

function filterStateToQuery(filters: LeadFilterState, offset: number): LeadListFilters {
  return {
    status: filters.status === 'all' ? undefined : filters.status,
    search: filters.search.trim() || undefined,
    name: filters.name.trim() || undefined,
    phone: filters.phone.trim() || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    limit: 100,
    offset,
  }
}

function proposalHref(artifact: CalculationRecord['proposalArtifacts'][number]) {
  if (artifact.pdfUrlPath) return buildApiUrl(artifact.pdfUrlPath)
  if (artifact.pdfUrl) return artifact.pdfUrl
  return buildApiUrl(artifact.urlPath)
}

function proposalButtonLabel(artifact: CalculationRecord['proposalArtifacts'][number]) {
  return hasPdfArtifact(artifact) ? 'PDF' : 'КП'
}

function hasPdfArtifact(artifact: CalculationRecord['proposalArtifacts'][number] | undefined) {
  return Boolean(artifact?.pdfUrlPath || artifact?.pdfUrl)
}

function proposalMeta(lead: CalculationRecord) {
  const artifact = lead.proposalArtifacts[0]
  if (!artifact) return 'КП еще не создано'
  return `${artifact.offerNumber} · ${formatDateTime(artifact.createdAt)}`
}

function proposalProcessStatus(lead: CalculationRecord) {
  const artifact = lead.proposalArtifacts[0]
  if (!artifact) return 'Не создано'
  if (artifact.status === 'ready') return 'Готово'
  return hasPdfArtifact(artifact) ? 'PDF готовится' : 'Открыть онлайн'
}

function proposalArtifactSummary(artifact: CalculationRecord['proposalArtifacts'][number]) {
  return `${proposalArtifactFormat(artifact)}, ${proposalArtifactStatusLabel(artifact).toLowerCase()}`
}

function proposalArtifactFormat(artifact: CalculationRecord['proposalArtifacts'][number]) {
  return hasPdfArtifact(artifact) ? 'PDF' : 'Онлайн-версия'
}

function proposalArtifactStatusLabel(artifact: CalculationRecord['proposalArtifacts'][number]) {
  return artifact.status === 'ready' ? 'Готово' : 'В обработке'
}

function telegramTone(status: TelegramDeliveryRecord['status']) {
  if (status === 'sent') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'pending_start') return 'amber'
  return 'gray'
}

function telegramDeliveryMeta(delivery: TelegramDeliveryRecord) {
  const attempts = delivery.attemptCount > 0
    ? `попыток: ${numberFormatter.format(delivery.attemptCount)}`
    : 'попыток нет'
  const timestamp = delivery.deliveredAt ?? delivery.lastAttemptAt ?? delivery.updatedAt
  return `${attempts} · обновлено ${formatDateTime(timestamp)}`
}

function telegramRecipientLabel(delivery: TelegramDeliveryRecord) {
  if (delivery.telegramUsername) return `Получатель: @${delivery.telegramUsername}`
  if (delivery.telegramUserId) return `Получатель: ID пользователя ${delivery.telegramUserId}`
  if (delivery.telegramChatId) return `Получатель: ID чата ${delivery.telegramChatId}`
  return 'Получатель еще не привязан'
}

function telegramDeliveryStatusDetail(delivery: TelegramDeliveryRecord) {
  if (delivery.status === 'disabled') return 'Канал доставки отключен.'
  if (delivery.status === 'pending_start') return 'Ожидаем, когда клиент откроет Telegram для получения документов.'
  if (delivery.status === 'sent') return 'Документы отправлены.'
  if (delivery.status === 'failed') return 'Автоматическая отправка не прошла, проверьте канал доставки.'
  return null
}

function calculationStatus(value: string): CalculationStatus {
  if (statusOptions.some((status) => status === value)) {
    return value as CalculationStatus
  }
  return 'new'
}

function linePricingLabel(lineItem: CalculationLineItem) {
  if (lineItem.quantity.kind === 'fixed') return 'Фиксированная'
  return `${formatArea(lineItem.quantity.areaSqm)} x ${formatUsd(lineItem.unitPriceUsdCents)}`
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неожиданная ошибка'
}
