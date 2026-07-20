import type {
  CalculationListItem,
  CalculationRecord,
  CalculationStatus,
  TelegramDeliveryRecord,
} from '@poznyak-engineering-calculator/contracts'

export type ProjectRecordLike = CalculationListItem | CalculationRecord

export type MacroStageId =
  | 'new'
  | 'proposal'
  | 'questionnaire'
  | 'contract'
  | 'design'
  | 'handover'
  | 'terminal'

export type Tone = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'gray' | 'orange'

export type DueTone = 'overdue' | 'today' | 'planned' | 'done'

export type DerivedTask = {
  id: string
  projectId: string
  projectTitle: string
  clientName: string
  title: string
  detail: string
  stage: MacroStageId
  stageLabel: string
  owner: string
  dueAt: string
  dueLabel: string
  tone: DueTone
  type: 'contact' | 'proposal' | 'questionnaire' | 'contract' | 'project' | 'handover' | 'closed'
  done: boolean
}

export const activeStageConfigs: Array<{
  id: Exclude<MacroStageId, 'terminal'>
  label: string
  shortLabel: string
  tone: Tone
}> = [
  { id: 'new', label: 'Новая заявка', shortLabel: 'Заявка', tone: 'blue' },
  { id: 'proposal', label: 'КП', shortLabel: 'КП', tone: 'blue' },
  { id: 'questionnaire', label: 'ТЗ', shortLabel: 'ТЗ', tone: 'green' },
  { id: 'contract', label: 'Договор', shortLabel: 'Договор', tone: 'violet' },
  { id: 'design', label: 'Проектирование', shortLabel: 'Проект', tone: 'green' },
  { id: 'handover', label: 'Проверка и выдача', shortLabel: 'Выдача', tone: 'orange' },
]

export const statusLabels: Record<CalculationStatus, string> = {
  new: 'Новая',
  contacted: 'Связались',
  in_progress: 'В работе',
  won: 'Договорились',
  lost: 'Отказ',
  spam_test: 'Спам/тест',
}

export const statusOptions = [
  'new',
  'contacted',
  'in_progress',
  'won',
  'lost',
  'spam_test',
] as const satisfies readonly CalculationStatus[]

export const telegramStatusLabels: Record<TelegramDeliveryRecord['status'], string> = {
  disabled: 'Не настроено',
  pending_start: 'Ожидает Telegram',
  sent: 'Отправлено',
  failed: 'Ошибка',
}

export const numberFormatter = new Intl.NumberFormat('ru-RU')
export const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
})
export const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
})

export function projectStage(project: ProjectRecordLike): MacroStageId {
  if (project.status === 'spam_test' || project.status === 'lost') return 'terminal'
  if (project.status === 'won') return 'contract'

  const completionPercent = questionnaireProgress(project)?.completionPercent ?? 0

  if (project.status === 'in_progress' && completionPercent >= 90) return 'design'
  if (project.status === 'in_progress' || completionPercent > 0) return 'questionnaire'
  if (project.status === 'contacted') return 'proposal'

  return 'new'
}

export function stageConfig(stage: MacroStageId) {
  return activeStageConfigs.find((item) => item.id === stage) ?? {
    id: 'terminal' as const,
    label: 'Закрыто',
    shortLabel: 'Архив',
    tone: 'gray' as const,
  }
}

export function documentState(project: ProjectRecordLike) {
  if (project.status === 'won') return 'КП согласовано, договор не создан'
  if (project.status === 'lost') return 'Отказ зафиксирован'
  if (project.status === 'spam_test') return 'Исключено из активной работы'
  if (project.questionnaire) {
    return `ТЗ ${questionnaireProgress(project)?.completionPercent ?? 0}%`
  }
  if (project.proposalArtifacts.length > 0) return 'КП сформировано'
  if (project.status === 'contacted') return 'КП требует проверки'
  return 'Нужно связаться'
}

export function projectRiskTone(project: ProjectRecordLike): Tone {
  if (project.status === 'lost' || project.status === 'spam_test') return 'gray'
  if (!project.objectName || !project.questionnaire) return 'amber'
  if (latestTelegramDelivery(project.telegramDeliveries)?.status === 'failed') return 'red'
  if (project.status === 'won') return 'violet'
  return 'blue'
}

export function deriveTask(project: ProjectRecordLike): DerivedTask {
  const stage = projectStage(project)
  const stageDetails = stageConfig(stage)
  const createdAt = new Date(project.createdAt)
  const statusUpdatedAt = new Date(project.statusUpdatedAt)
  const dueAt = taskDueDate(project.status, statusUpdatedAt, createdAt)
  const done = stage === 'terminal'
  const tone = done ? 'done' : dueTone(dueAt)
  const descriptor = taskDescriptor(project, stage)

  return {
    id: `derived-${project.id}`,
    projectId: project.id,
    projectTitle: project.objectName ?? formatArea(project.areaSqm),
    clientName: project.clientName,
    title: descriptor.title,
    detail: descriptor.detail,
    stage,
    stageLabel: stageDetails.label,
    owner: 'ИП',
    dueAt: dueAt.toISOString(),
    dueLabel: done ? 'Закрыто' : formatTaskDue(dueAt, tone),
    tone,
    type: descriptor.type,
    done,
  }
}

export function activeProjects(projects: readonly ProjectRecordLike[]) {
  return projects.filter((project) => projectStage(project) !== 'terminal')
}

export function sortedTasks(projects: readonly ProjectRecordLike[]) {
  return projects
    .map(deriveTask)
    .sort((first, second) => {
      if (first.done !== second.done) return first.done ? 1 : -1
      return new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime()
    })
}

export function missingDataCount(projects: readonly ProjectRecordLike[]) {
  return activeProjects(projects).filter((project) => !project.objectName || !project.questionnaire).length
}

export function blockers(projects: readonly ProjectRecordLike[]) {
  return activeProjects(projects).filter((project) => {
    if (!project.questionnaire) return true
    if ((questionnaireProgress(project)?.completionPercent ?? 0) < 50) return true
    return latestTelegramDelivery(project.telegramDeliveries)?.status === 'failed'
  })
}

export function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(value))
}

export function formatByn(rubles: number) {
  return `${numberFormatter.format(rubles)} BYN`
}

export function formatUsd(cents: number) {
  const value = cents / 100
  const formatted = value % 1 === 0
    ? numberFormatter.format(value)
    : new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)

  return `~${formatted} USD`
}

export function formatArea(value: string | number) {
  return `${value} м²`
}

export function servicesSummary(services: ProjectRecordLike['serviceSnapshots']) {
  if (services.length === 0) return 'Нет услуг'
  const visible = services.slice(0, 2).map((service) => service.title).join(', ')
  return services.length > 2 ? `${visible} +${services.length - 2}` : visible
}

export function latestTelegramDelivery(deliveries: readonly TelegramDeliveryRecord[]) {
  return deliveries.length > 0 ? deliveries[deliveries.length - 1] : null
}

export function telegramDeliveryTargetLabel(targetType: TelegramDeliveryRecord['targetType']) {
  if (targetType === 'proposal') return 'КП/PDF'
  return 'Примеры проектов'
}

export function leadSourceLabel(source: string | null) {
  if (source === 'example_request') return 'Запрос примера проекта'
  if (source === 'public_questionnaire') return 'Подробный опросник'
  if (source === 'public_offer_preliminary') return 'Предварительное КП'
  if (source === 'public_website') return 'Публичный сайт'
  if (source === 'public_calculator') return 'Калькулятор'
  return source ?? 'Не указан'
}

export function pricingTypeLabel(pricingType: ProjectRecordLike['serviceSnapshots'][number]['pricingType']) {
  if (pricingType === 'fixed') return 'Фиксированная'
  if (pricingType === 'per_sqm') return 'За м²'
  return 'Формула'
}

export function exchangeRateSourceLabel(source: string) {
  if (source === 'manual') return 'вручную'
  if (source === 'nbrb') return 'НБ РБ'
  return source
}

function taskDescriptor(project: ProjectRecordLike, stage: MacroStageId) {
  if (project.status === 'lost' || project.status === 'spam_test') {
    return {
      title: 'Проект закрыт',
      detail: statusLabels[project.status],
      type: 'closed' as const,
    }
  }

  if (stage === 'proposal') {
    return {
      title: 'Проверить КП и отправить клиенту',
      detail: 'Сверить состав услуг, сумму и ссылку на PDF/HTML.',
      type: 'proposal' as const,
    }
  }

  if (stage === 'questionnaire') {
    return {
      title: 'Довести черновик ТЗ до проверки',
      detail: questionnaireTaskDetail(project),
      type: 'questionnaire' as const,
    }
  }

  if (stage === 'contract') {
    return {
      title: 'Подготовить договор после согласования КП',
      detail: 'Договор в этой задаче только будущий слот, без генерации шаблонов.',
      type: 'contract' as const,
    }
  }

  if (stage === 'design') {
    return {
      title: 'Передать проектирование в работу',
      detail: 'Проверить ТЗ и ответственного проектировщика перед стартом.',
      type: 'project' as const,
    }
  }

  if (stage === 'handover') {
    return {
      title: 'Проверить выдачу и финальную оплату',
      detail: 'Проверка требований и спецификации остаются UI-only слотами.',
      type: 'handover' as const,
    }
  }

  return {
    title: 'Связаться с клиентом',
    detail: 'Проверить задачу, объект, площадь и следующий шаг по КП.',
    type: 'contact' as const,
  }
}

function questionnaireTaskDetail(project: ProjectRecordLike) {
  const progress = questionnaireProgress(project)
  if (!progress) return 'Создать и отправить подробный опросник.'
  return `${progress.answeredCount}/${progress.totalQuestions} ответов, ${progress.skippedCount} пропусков.`
}

function questionnaireProgress(project: ProjectRecordLike) {
  const questionnaire = project.questionnaire
  if (!questionnaire) return null
  if ('progress' in questionnaire) return questionnaire.progress

  return {
    totalQuestions: questionnaire.totalQuestions,
    answeredCount: questionnaire.answeredCount,
    optionCount: 0,
    customCount: 0,
    unknownCount: questionnaire.unknownCount,
    skippedCount: questionnaire.skippedCount,
    completionPercent: questionnaire.completionPercent,
    completedAt: null,
  }
}

function taskDueDate(status: CalculationStatus, statusUpdatedAt: Date, createdAt: Date) {
  const base = Number.isNaN(statusUpdatedAt.getTime()) ? createdAt : statusUpdatedAt
  const due = new Date(base)
  const daysByStatus: Record<CalculationStatus, number> = {
    new: 0,
    contacted: 1,
    in_progress: 2,
    won: 3,
    lost: 0,
    spam_test: 0,
  }

  due.setDate(due.getDate() + daysByStatus[status])
  due.setHours(17, 0, 0, 0)
  return due
}

function dueTone(dueAt: Date): DueTone {
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const tomorrowStart = new Date(todayStart)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)

  if (dueAt.getTime() < now.getTime()) return 'overdue'
  if (dueAt.getTime() < tomorrowStart.getTime()) return 'today'
  return 'planned'
}

function formatTaskDue(dueAt: Date, tone: DueTone) {
  const time = dueAt.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (tone === 'overdue') return `Просрочено с ${dateFormatter.format(dueAt)}, ${time}`
  if (tone === 'today') return `Сегодня, ${time}`
  return `${dateFormatter.format(dueAt)}, ${time}`
}
