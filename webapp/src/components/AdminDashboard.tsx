import type { CalculationListItem } from '@poznyak-engineering-calculator/contracts'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

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
import { Typography } from '@/components/ui/typography'
import {
  activeProjects,
  activeStageConfigs,
  blockers,
  deriveTask,
  documentState,
  formatArea,
  formatByn,
  formatDate,
  missingDataCount,
  numberFormatter,
  projectRiskTone,
  projectStage,
  sortedTasks,
  stageConfig,
  type DerivedTask,
  type DueTone,
} from '@/lib/admin-derived'
import { ApiRequestError } from '@/lib/api'
import { useAllLeadsQuery, useProjectExampleRequestsQuery } from '@/lib/leads-queries'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type ActionFilter = 'all' | 'overdue' | 'today' | 'client'

const actionFilters: Array<{ id: ActionFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'overdue', label: 'Просрочено' },
  { id: 'today', label: 'Сегодня' },
  { id: 'client', label: 'Ожидаем клиента' },
]

export function AdminDashboard() {
  const auth = useAuth()
  const [filter, setFilter] = useState<ActionFilter>('all')
  const leadsQuery = useAllLeadsQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const exampleRequestsQuery = useProjectExampleRequestsQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
    limit: 10,
  })
  const leads = useMemo(() => leadsQuery.data?.calculations ?? [], [leadsQuery.data?.calculations])
  const tasks = useMemo(() => sortedTasks(leads), [leads])
  const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, filter)).slice(0, 12)
  const active = activeProjects(leads)
  const blockingProjects = blockers(leads).slice(0, 5)
  const newLeads = leads.filter((lead) => lead.status === 'new').slice(0, 5)
  const overdueCount = tasks.filter((task) => task.tone === 'overdue').length
  const todayCount = tasks.filter((task) => task.tone === 'today').length

  return (
    <section className="admin-view" aria-labelledby="dashboard-heading">
      <AdminPageHeader
        eyebrow="Рабочее пространство"
        title="Рабочий стол"
        description="Сводка по действиям, активной воронке и данным, которые уже есть в калькуляторе."
        actions={
          <Button type="button" variant="outline" onClick={() => void leadsQuery.refetch()}>
            Обновить
          </Button>
        }
      />

      {leadsQuery.isLoading ? (
        <LoadingBlock label="Загружаем рабочий стол..." />
      ) : leadsQuery.isError ? (
        <ErrorBlock
          title="Не удалось загрузить рабочий стол"
          description={errorMessage(leadsQuery.error)}
          onRetry={() => void leadsQuery.refetch()}
        />
      ) : (
        <>
          {leadsQuery.data && !leadsQuery.data.isComplete && (
            <Alert>
              <AlertTitle>Рабочий стол загружен частично</AlertTitle>
              <AlertDescription>
                Показано {numberFormatter.format(leadsQuery.data.loadedCount)} из{' '}
                {numberFormatter.format(leadsQuery.data.summary.filteredCount)} записей, доступных через текущую пагинацию API.
              </AlertDescription>
            </Alert>
          )}

          <div className="admin-priority-strip">
            <MetricTile label="Просрочено" value={overdueCount} tone={overdueCount > 0 ? 'red' : 'green'} />
            <MetricTile label="На сегодня" value={todayCount} tone="amber" />
            <MetricTile label="Без полных данных" value={missingDataCount(leads)} tone="gray" />
          </div>

          <div className="admin-dashboard-grid">
            <div className="admin-stack">
              <AdminPanel
                title="Мои действия"
                description="Derived view из статусов, КП, черновиков ТЗ и Telegram-доставки."
                action={
                  <div className="admin-segmented">
                    {actionFilters.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant={filter === item.id ? 'default' : 'ghost'}
                        size="xs"
                        onClick={() => setFilter(item.id)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>
                }
              >
                {visibleTasks.length === 0 ? (
                  <EmptyState title="Действий нет" description="В этой категории сейчас нет derived задач." />
                ) : (
                  <div className="admin-action-list">
                    {visibleTasks.map((task) => (
                      <ActionRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
              </AdminPanel>

              <AdminPanel
                title="Новые необработанные заявки"
                description="Только свежий входящий поток, без больших декоративных KPI."
              >
                {newLeads.length === 0 ? (
                  <EmptyState title="Новых заявок нет" description="Все входящие заявки уже получили следующий рабочий статус." />
                ) : (
                  <div className="admin-compact-list">
                    {newLeads.map((lead) => (
                      <CompactLeadRow key={lead.id} lead={lead} />
                    ))}
                  </div>
                )}
              </AdminPanel>

              <AdminPanel
                title="Запросы примеров проектов"
                description="Отдельный поток PZK-017/PZK-020 с Telegram-доставкой."
                action={
                  <Button type="button" variant="outline" size="sm" onClick={() => void exampleRequestsQuery.refetch()}>
                    Обновить
                  </Button>
                }
              >
                {exampleRequestsQuery.isLoading ? (
                  <LoadingBlock label="Загружаем запросы примеров..." />
                ) : exampleRequestsQuery.isError ? (
                  <ErrorBlock
                    title="Не удалось загрузить запросы примеров"
                    description={errorMessage(exampleRequestsQuery.error)}
                    onRetry={() => void exampleRequestsQuery.refetch()}
                  />
                ) : (exampleRequestsQuery.data?.requests.length ?? 0) === 0 ? (
                  <EmptyState title="Запросов пока нет" description="Когда посетитель запросит PDF-примеры, записи появятся здесь." />
                ) : (
                  <div className="admin-compact-list">
                    {exampleRequestsQuery.data?.requests.map((request) => (
                      <div key={request.id} className="admin-compact-row">
                        <div className="admin-compact-main">
                          <Typography variant="bodySmMedium">{request.clientName}</Typography>
                          <Typography variant="caption" tone="muted">
                            {formatDate(request.createdAt)} · {request.clientPhone}
                          </Typography>
                        </div>
                        <StatusPill tone={request.telegramDeliveries.some((item) => item.status === 'sent') ? 'green' : 'amber'}>
                          {request.requestedExamples.map((item) => item.code).join(', ')}
                        </StatusPill>
                      </div>
                    ))}
                  </div>
                )}
              </AdminPanel>
            </div>

            <aside className="admin-stack">
              <AdminPanel title="Активная воронка" description={`${numberFormatter.format(active.length)} активных проектов`}>
                <div className="admin-stage-summary">
                  {activeStageConfigs.map((stage) => {
                    const count = active.filter((project) => projectStage(project) === stage.id).length
                    const width = active.length > 0 ? Math.max(8, Math.round((count / active.length) * 100)) : 0

                    return (
                      <div key={stage.id} className="admin-stage-row">
                        <Typography variant="caption">{stage.label}</Typography>
                        <div className="admin-stage-bar" aria-hidden="true">
                          <i className={`tone-${stage.tone}`} style={{ width: `${width}%` }} />
                        </div>
                        <Typography className="numeric" variant="controlXs">{String(count)}</Typography>
                      </div>
                    )
                  })}
                </div>
              </AdminPanel>

              <AdminPanel title="Блокирующие проблемы" description="Показывает данные, которые мешают следующему шагу.">
                {blockingProjects.length === 0 ? (
                  <EmptyState title="Критичных блокеров нет" description="Активные записи не требуют немедленной ручной проверки." />
                ) : (
                  <div className="admin-notice-list">
                    {blockingProjects.map((lead) => (
                      <Link key={lead.id} className="admin-notice amber" to="/app/leads/$leadId" params={{ leadId: lead.id }}>
                        <Typography variant="bodySmMedium">{lead.clientName}</Typography>
                        <Typography variant="caption" tone="muted">{documentState(lead)}</Typography>
                      </Link>
                    ))}
                  </div>
                )}
              </AdminPanel>

              <AdminPanel title="Контроль выдачи" description="Stage 1 placeholder без платежных и документных мутаций.">
                <div className="admin-notice-list">
                  <div className="admin-notice">
                    <Typography variant="bodySmMedium">Спецификации заблокированы оплатой</Typography>
                    <Typography variant="caption" tone="muted">
                      В текущих данных нет платежного gate, поэтому блок показан как read-only слот будущего этапа.
                    </Typography>
                  </div>
                  <div className="admin-notice">
                    <Typography variant="bodySmMedium">Непроверенные требования</Typography>
                    <Typography variant="caption" tone="muted">
                      Матрица требований не создается в PZK-021 и не пишет новые backend-состояния.
                    </Typography>
                  </div>
                </div>
              </AdminPanel>
            </aside>
          </div>
        </>
      )}
    </section>
  )
}

function ActionRow({ task }: { task: DerivedTask }) {
  return (
    <Link className="admin-action-row" to="/app/leads/$leadId" params={{ leadId: task.projectId }}>
      <span className={cn('admin-action-signal', `tone-${taskTone(task.tone)}`)} aria-hidden="true" />
      <div className="admin-action-main">
        <Typography variant="bodySmMedium">{task.title}</Typography>
        <Typography variant="caption" tone="muted">
          {task.clientName} · {task.projectTitle}
        </Typography>
      </div>
      <StatusPill tone={stageConfig(task.stage).tone}>{task.stageLabel}</StatusPill>
      <Typography className={cn('admin-due', `tone-${taskTone(task.tone)}`)} variant="caption">
        {task.dueLabel}
      </Typography>
      <Typography variant="caption" tone="muted">{task.owner}</Typography>
    </Link>
  )
}

function CompactLeadRow({ lead }: { lead: CalculationListItem }) {
  const stage = stageConfig(projectStage(lead))
  const task = deriveTask(lead)

  return (
    <Link className="admin-compact-row" to="/app/leads/$leadId" params={{ leadId: lead.id }}>
      <div className="admin-compact-main">
        <Typography variant="bodySmMedium">{lead.clientName}</Typography>
        <Typography variant="caption" tone="muted">
          {lead.objectName ?? formatArea(lead.areaSqm)} · {formatByn(lead.totalBynRoundedRubles)}
        </Typography>
      </div>
      <div className="admin-compact-meta">
        <StatusPill tone={projectRiskTone(lead)}>{stage.label}</StatusPill>
        <Typography variant="caption" tone="muted">{task.dueLabel}</Typography>
      </div>
    </Link>
  )
}

function taskMatchesFilter(task: DerivedTask, filter: ActionFilter) {
  if (filter === 'all') return !task.done
  if (filter === 'overdue') return task.tone === 'overdue'
  if (filter === 'today') return task.tone === 'today'
  return task.type === 'questionnaire'
}

function taskTone(tone: DueTone) {
  if (tone === 'overdue') return 'red'
  if (tone === 'today') return 'amber'
  if (tone === 'done') return 'green'
  return 'blue'
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неожиданная ошибка'
}
