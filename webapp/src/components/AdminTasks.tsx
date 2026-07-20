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
  sortedTasks,
  stageConfig,
  type DerivedTask,
  type DueTone,
} from '@/lib/admin-derived'
import { ApiRequestError } from '@/lib/api'
import { useAllLeadsQuery } from '@/lib/leads-queries'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type TaskFilter = 'all' | 'overdue' | 'today' | 'planned' | 'done'

const taskFilters: Array<{ id: TaskFilter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'overdue', label: 'Просрочено' },
  { id: 'today', label: 'Сегодня' },
  { id: 'planned', label: 'Запланировано' },
  { id: 'done', label: 'Выполнено' },
]

export function AdminTasks() {
  const auth = useAuth()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const leadsQuery = useAllLeadsQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const tasks = useMemo(() => sortedTasks(leadsQuery.data?.calculations ?? []), [leadsQuery.data?.calculations])
  const visibleTasks = tasks.filter((task) => taskMatchesFilter(task, filter))

  return (
    <section className="admin-view" aria-labelledby="tasks-heading">
      <AdminPageHeader
        eyebrow="Работа"
        title="Задачи"
        description="Derived task shell поверх текущих заявок. Persistent task model не создается в PZK-021."
        actions={
          <Button type="button" variant="outline" onClick={() => void leadsQuery.refetch()}>
            Обновить
          </Button>
        }
      />

      {leadsQuery.isLoading ? (
        <LoadingBlock label="Загружаем задачи..." />
      ) : leadsQuery.isError ? (
        <ErrorBlock
          title="Не удалось загрузить задачи"
          description={errorMessage(leadsQuery.error)}
          onRetry={() => void leadsQuery.refetch()}
        />
      ) : (
        <>
          {leadsQuery.data && !leadsQuery.data.isComplete && (
            <Alert>
              <AlertTitle>Задачи загружены частично</AlertTitle>
              <AlertDescription>
                Показано {leadsQuery.data.loadedCount} из {leadsQuery.data.summary.filteredCount} записей, доступных через текущую пагинацию API.
              </AlertDescription>
            </Alert>
          )}

          <div className="admin-priority-strip">
            <MetricTile label="Просрочено" value={tasks.filter((task) => task.tone === 'overdue').length} tone="red" />
            <MetricTile label="Сегодня" value={tasks.filter((task) => task.tone === 'today').length} tone="amber" />
            <MetricTile label="Запланировано" value={tasks.filter((task) => task.tone === 'planned').length} tone="blue" />
          </div>

          <div className="admin-toolbar">
            <div className="admin-segmented">
              {taskFilters.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  variant={filter === item.id ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>

          <AdminPanel
            title="Список задач"
            description="Завершение задач пока не сохраняется, чтобы не вводить необратимую workflow-модель."
          >
            {visibleTasks.length === 0 ? (
              <EmptyState title="Задач нет" description="В выбранном фильтре нет derived задач по текущим данным." />
            ) : (
              <div className="admin-task-list">
                {visibleTasks.map((task) => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            )}
          </AdminPanel>
        </>
      )}
    </section>
  )
}

function TaskRow({ task }: { task: DerivedTask }) {
  const stage = stageConfig(task.stage)

  return (
    <div className="admin-task-row">
      <div className={cn('admin-task-check', task.done && 'is-done')} aria-hidden="true" />
      <div className="admin-task-main">
        <Typography variant="bodySmMedium">{task.title}</Typography>
        <Typography variant="caption" tone="muted">
          {task.detail}
        </Typography>
        <Link className="admin-inline-link" to="/app/leads/$leadId" params={{ leadId: task.projectId }}>
          <Typography as="span" variant="caption">
            {task.clientName} · {task.projectTitle}
          </Typography>
        </Link>
      </div>
      <StatusPill tone={stage.tone}>{stage.label}</StatusPill>
      <Typography className={cn('admin-due', `tone-${taskTone(task.tone)}`)} variant="caption">
        {task.dueLabel}
      </Typography>
      <Typography variant="caption" tone="muted">{task.owner}</Typography>
      <Button type="button" variant="outline" size="sm" disabled>
        Выполнить
      </Button>
    </div>
  )
}

function taskMatchesFilter(task: DerivedTask, filter: TaskFilter) {
  if (filter === 'all') return true
  if (filter === 'done') return task.done
  return !task.done && task.tone === filter
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
