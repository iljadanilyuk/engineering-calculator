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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Spinner } from '@/components/ui/spinner'
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

const statusOptions = [
  'new',
  'contacted',
  'in_progress',
  'won',
  'lost',
  'spam_test',
] as const satisfies readonly CalculationStatus[]

const statusLabels: Record<CalculationStatus, string> = {
  new: 'Новая',
  contacted: 'Связались',
  in_progress: 'В работе',
  won: 'Договорились',
  lost: 'Отказ',
  spam_test: 'Спам/тест',
}

const telegramStatusLabels: Record<TelegramDeliveryRecord['status'], string> = {
  disabled: 'Не настроено',
  pending_start: 'Ожидает Telegram',
  sent: 'Отправлено',
  failed: 'Ошибка',
}

const defaultFilters: LeadFilterState = {
  status: 'all',
  search: '',
  name: '',
  phone: '',
  createdFrom: '',
  createdTo: '',
}

const numberFormatter = new Intl.NumberFormat('ru-RU')
const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'short',
})

export function LeadsManager() {
  const auth = useAuth()
  const [filters, setFilters] = useState(defaultFilters)
  const [offset, setOffset] = useState(0)
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
    <section className="grid gap-6" aria-labelledby="leads-heading">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LeadMetric label="Активные заявки" value={summary?.activeCount ?? 0} />
        <LeadMetric label="Новые" value={summary?.statusCounts.new ?? 0} />
        <LeadMetric label="Договорились" value={summary?.statusCounts.won ?? 0} />
        <LeadMetric label="Спам/тест" value={summary?.spamTestCount ?? 0} muted />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <div className="grid gap-2">
            <CardTitle id="leads-heading">Заявки из калькулятора</CardTitle>
            <CardDescription>
              {summary
                ? `Показано ${numberFormatter.format(pageRange?.start ?? 0)}-${numberFormatter.format(pageRange?.end ?? 0)} из ${numberFormatter.format(summary.filteredCount)} · всего ${numberFormatter.format(summary.totalCount)}`
                : 'Загружаем заявки'}
            </CardDescription>
          </div>
          <CardAction className="col-start-1 row-start-auto justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
            <Button type="button" variant="outline" onClick={() => void leadsQuery.refetch()}>
              Обновить
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LeadFilters filters={filters} onChange={updateFilters} onClear={clearFilters} />

          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось обновить заявку</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {leadsQuery.isLoading ? (
            <div className="flex items-center gap-3 py-8">
              <Spinner />
              <Typography tone="muted">Загружаем заявки...</Typography>
            </div>
          ) : leadsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Не удалось загрузить заявки</AlertTitle>
              <AlertDescription>{errorMessage(leadsQuery.error)}</AlertDescription>
            </Alert>
          ) : leads.length === 0 ? (
            <div className="grid gap-3 rounded-lg border border-dashed p-8">
              <Typography variant="h6">Заявок нет</Typography>
              <Typography tone="muted">Измените фильтры или дождитесь первой заявки с сайта.</Typography>
            </div>
          ) : (
            <>
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Дата</TableHead>
                      <TableHead>Клиент</TableHead>
                      <TableHead>Телефон</TableHead>
                      <TableHead>Площадь</TableHead>
                      <TableHead>Услуги</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead>BYN</TableHead>
                      <TableHead>USD</TableHead>
                      <TableHead>КП/PDF</TableHead>
                      <TableHead>Telegram</TableHead>
                      <TableHead className="text-right">Карточка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow
                        key={lead.id}
                        className={cn(lead.status === 'spam_test' && 'bg-muted/30 text-muted-foreground')}
                      >
                        <TableCell className="whitespace-nowrap">
                          {formatDateTime(lead.createdAt)}
                        </TableCell>
                        <TableCell className="min-w-[160px] whitespace-normal">
                          <LeadClientSummary lead={lead} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{lead.clientPhone}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatArea(lead.areaSqm)}</TableCell>
                        <TableCell className="max-w-[220px] whitespace-normal">
                          {servicesSummary(lead.serviceSnapshots)}
                        </TableCell>
                        <TableCell>
                          <LeadStatusSelect
                            value={lead.status}
                            label={`Статус заявки ${lead.clientName}`}
                            disabled={updateLead.isPending}
                            onChange={(status) => void changeStatus(lead, status)}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Typography className="tabular-nums" variant="bodySmMedium">
                            {formatByn(lead.totalBynRoundedRubles)}
                          </Typography>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatUsd(lead.totalUsdCents)}
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
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="grid gap-3 lg:hidden">
                {leads.map((lead) => (
                  <LeadMobileCard
                    key={lead.id}
                    lead={lead}
                    statusDisabled={updateLead.isPending}
                    onStatusChange={changeStatus}
                  />
                ))}
              </div>
            </>
          )}

          {summary && summary.filteredCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Typography variant="bodySm" tone="muted">
                Показано {numberFormatter.format(pageRange?.start ?? 0)}-{numberFormatter.format(pageRange?.end ?? 0)} из{' '}
                {numberFormatter.format(summary.filteredCount)}
              </Typography>
              <div className="flex gap-2">
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
        </CardContent>
      </Card>

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

  async function saveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lead) return
    const formData = new FormData(event.currentTarget)
    const notes = String(formData.get('notes') ?? '')
    setActionError(null)
    setSavedMessage(null)

    try {
      await updateLead.mutateAsync({
        id: lead.id,
        input: { notes },
      })
      setSavedMessage('Заметки сохранены')
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  if (leadQuery.isLoading) {
    return (
      <section className="flex items-center gap-3 py-8" aria-label="Загрузка заявки">
        <Spinner />
        <Typography tone="muted">Загружаем карточку заявки...</Typography>
      </section>
    )
  }

  if (leadQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Не удалось загрузить заявку</AlertTitle>
        <AlertDescription>{errorMessage(leadQuery.error)}</AlertDescription>
      </Alert>
    )
  }

  if (!lead) return null

  return (
    <section className="grid gap-6" aria-labelledby="lead-detail-heading">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild type="button" variant="outline" size="sm">
          <Link to="/app/leads">Назад к заявкам</Link>
        </Button>
        <Badge variant={lead.status === 'spam_test' ? 'secondary' : 'outline'}>
          {statusLabels[lead.status]}
        </Badge>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="grid gap-2">
                <CardTitle id="lead-detail-heading">{lead.clientName}</CardTitle>
                <CardDescription>
                  Создана {formatDateTime(lead.createdAt)} · обновлена {formatDateTime(lead.updatedAt)}
                </CardDescription>
              </div>
              <CardAction className="col-start-1 row-start-auto justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
                <ProposalLink
                  lead={lead}
                  preferredLabel={hasPdfArtifact(lead.proposalArtifacts[0]) ? 'Открыть PDF' : 'Открыть КП'}
                />
              </CardAction>
            </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <DetailItem label="Телефон" value={lead.clientPhone} />
                <DetailItem label="Источник" value={leadSourceLabel(lead.source)} />
                <DetailItem label="Объект" value={lead.objectName ?? 'Не указан'} />
                <DetailItem label="Площадь" value={formatArea(lead.areaSqm)} />
                <DetailItem label="Сумма КП" value={`${formatByn(lead.totalBynRoundedRubles)} · ${formatUsd(lead.totalUsdCents)}`} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Состав расчета</CardTitle>
              <CardDescription>
                Курс {lead.exchangeRate.usdToBynRate} BYN/USD · {exchangeRateSourceLabel(lead.exchangeRate.source)}
                {lead.exchangeRate.asOf ? ` · ${formatDateTime(lead.exchangeRate.asOf)}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid overflow-hidden rounded-lg border">
                {lead.calculationSnapshot.lineItems.map((lineItem) => (
                  <CalculationLine key={lineItem.serviceId} lineItem={lineItem} />
                ))}
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
                <DetailItem label="Итого USD" value={formatUsd(lead.totalUsdCents)} />
                <DetailItem label="BYN до округления" value={`${numberFormatter.format(lead.totalBynCents / 100)} BYN`} />
                <DetailItem label="Итого BYN" value={formatByn(lead.totalBynRoundedRubles)} />
              </div>
            </CardContent>
          </Card>

          <QuestionnaireDraftCard questionnaire={lead.questionnaire} />

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Снимок выбранных услуг</CardTitle>
              <CardDescription>
                Сохранен при отправке заявки и не зависит от текущих цен в админке.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {lead.serviceSnapshots.map((service) => (
                <div key={service.id} className="grid gap-1 rounded-lg border p-4">
                  <Typography variant="bodySmMedium">{service.title}</Typography>
                  <Typography variant="caption" tone="muted">
                    {pricingTypeLabel(service.pricingType)} · {formatUsd(service.priceUsdCents)}
                  </Typography>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="grid h-fit gap-6">
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Статус заявки</CardTitle>
              <CardDescription>
                Последнее изменение {formatDateTime(lead.statusUpdatedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field>
                <FieldLabel>Статус</FieldLabel>
                <LeadStatusSelect
                  value={lead.status}
                  label="Статус заявки"
                  disabled={updateLead.isPending}
                  onChange={(status) => void changeStatus(status)}
                />
              </Field>
              <DetailItem label="Статус обновлен" value={formatDateTime(lead.statusUpdatedAt)} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Telegram-доставка</CardTitle>
              <CardDescription>
                Статус отправки КП клиенту через Telegram после сохранения контакта.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TelegramDeliveryLog deliveries={lead.telegramDeliveries} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Внутренние заметки</CardTitle>
              <CardDescription>Служебный комментарий, который виден только в админке.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={(event) => void saveNotes(event)}>
                <Field>
                  <FieldLabel htmlFor="lead-notes">Внутренние заметки</FieldLabel>
                  <Textarea
                    id="lead-notes"
                    key={`${lead.id}-${lead.notes ?? ''}`}
                    name="notes"
                    defaultValue={lead.notes ?? ''}
                    rows={8}
                    maxLength={5_000}
                  />
                </Field>
                <Button type="submit" disabled={updateLead.isPending}>
                  Сохранить заметки
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>КП/PDF</CardTitle>
              <CardDescription>Открывается сохраненный артефакт исходного коммерческого предложения.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {lead.proposalArtifacts.length === 0 ? (
                <Typography tone="muted">КП/PDF для этой заявки не сохранен.</Typography>
              ) : (
                lead.proposalArtifacts.map((artifact) => (
                  <div key={artifact.id} className="grid gap-2 rounded-lg border p-4">
                    <Typography variant="bodySmMedium">{artifact.offerNumber}</Typography>
                    <Typography variant="caption" tone="muted">
                      {artifact.templateVersion} · {formatDateTime(artifact.createdAt)}
                    </Typography>
                    <Button asChild type="button" variant="outline" size="sm">
                      <a href={proposalHref(artifact)} target="_blank" rel="noreferrer">
                        <Typography as="span" variant="control">
                          {artifact.pdfUrlPath || artifact.pdfUrl ? 'Открыть PDF' : 'Открыть КП'}
                        </Typography>
                      </a>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Следующие этапы</CardTitle>
              <CardDescription>
                Место в карточке выделено под договор и будущие уточнения по проекту.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {lead.questionnaire ? (
                <Badge variant="secondary">Черновик ТЗ {lead.questionnaire.progress.completionPercent}%</Badge>
              ) : (
                <Badge variant="secondary">ТЗ не заполнено</Badge>
              )}
              <Badge variant="secondary">Договор позже</Badge>
              <TelegramDeliveryBadge delivery={latestTelegramDelivery(lead.telegramDeliveries)} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  )
}

function LeadClientSummary({
  lead,
}: {
  lead: Pick<CalculationListItem, 'clientName' | 'objectName' | 'source'>
}) {
  return (
    <div className="grid gap-1">
      <Typography variant="bodySmMedium">{lead.clientName}</Typography>
      <Typography variant="caption" tone="muted">
        Источник: {leadSourceLabel(lead.source)}
      </Typography>
      {lead.objectName && (
        <Typography variant="caption" tone="muted">
          {lead.objectName}
        </Typography>
      )}
    </div>
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
  return (
    <div className={cn('grid gap-4 rounded-lg border p-4', lead.status === 'spam_test' && 'bg-muted/30 text-muted-foreground')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <LeadClientSummary lead={lead} />
        <LeadStatusBadge status={lead.status} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <LeadMobileFact label="Телефон" value={lead.clientPhone} />
        <LeadMobileFact label="Дата" value={formatDateTime(lead.createdAt)} />
        <LeadMobileFact label="Площадь" value={formatArea(lead.areaSqm)} />
        <LeadMobileFact label="Сумма" value={formatByn(lead.totalBynRoundedRubles)} />
      </div>

      <div className="grid gap-1 border-t pt-3">
        <Typography variant="caption" tone="muted">
          Услуги
        </Typography>
        <Typography variant="bodySm">{servicesSummary(lead.serviceSnapshots)}</Typography>
      </div>

      <div className="grid gap-1 border-t pt-3">
        <Typography variant="caption" tone="muted">
          Telegram
        </Typography>
        <TelegramDeliverySummary deliveries={lead.telegramDeliveries} />
      </div>

      <div className="grid gap-3 border-t pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field>
          <FieldLabel>Статус</FieldLabel>
          <LeadStatusSelect
            value={lead.status}
            label={`Статус заявки ${lead.clientName}`}
            disabled={statusDisabled}
            onChange={(status) => void onStatusChange(lead, status)}
          />
        </Field>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <ProposalLink lead={lead} />
          <Button asChild type="button" variant="outline" size="sm">
            <Link to="/app/leads/$leadId" params={{ leadId: lead.id }}>
              Открыть
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function LeadStatusBadge({ status }: { status: CalculationStatus }) {
  return (
    <Badge variant={status === 'spam_test' ? 'secondary' : 'outline'}>
      {statusLabels[status]}
    </Badge>
  )
}

function TelegramDeliverySummary({
  deliveries,
  compact = false,
}: {
  deliveries: readonly TelegramDeliveryRecord[]
  compact?: boolean
}) {
  const delivery = latestTelegramDelivery(deliveries)

  if (!delivery) {
    return <Typography variant="bodySm" tone="muted">Нет попыток</Typography>
  }

  return (
    <div className="grid gap-1">
      <TelegramDeliveryBadge delivery={delivery} />
      {!compact && (
        <Typography variant="caption" tone="muted">
          {telegramDeliveryMeta(delivery)}
        </Typography>
      )}
    </div>
  )
}

function TelegramDeliveryLog({
  deliveries,
}: {
  deliveries: readonly TelegramDeliveryRecord[]
}) {
  if (deliveries.length === 0) {
    return <Typography tone="muted">Попыток Telegram-доставки пока нет.</Typography>
  }

  return (
    <div className="grid gap-3">
      {deliveries.map((delivery) => (
        <div key={delivery.id} className="grid gap-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <TelegramDeliveryBadge delivery={delivery} />
            <Typography variant="caption" tone="muted">
              {telegramDeliveryTargetLabel(delivery.targetType)}
            </Typography>
          </div>
          <Typography variant="caption" tone="muted">
            {telegramDeliveryMeta(delivery)}
          </Typography>
          {delivery.statusMessage && (
            <Typography className="break-words" variant="bodySm">
              {delivery.statusMessage}
            </Typography>
          )}
          <Typography variant="caption" tone="muted">
            {telegramRecipientLabel(delivery)}
          </Typography>
        </div>
      ))}
    </div>
  )
}

function TelegramDeliveryBadge({
  delivery,
}: {
  delivery: TelegramDeliveryRecord | null
}) {
  if (!delivery) return <Badge variant="secondary">Telegram нет</Badge>

  return (
    <Badge variant={telegramDeliveryBadgeVariant(delivery.status)}>
      {telegramStatusLabels[delivery.status]}
    </Badge>
  )
}

function LeadMobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <Typography variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography className="tabular-nums" variant="bodySmMedium">
        {value}
      </Typography>
    </div>
  )
}

function CalculationLine({ lineItem }: { lineItem: CalculationLineItem }) {
  return (
    <div className="grid gap-3 border-b p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="grid gap-1">
        <Typography variant="bodySmMedium">
          {lineItem.serviceSnapshot.title}
        </Typography>
        {lineItem.serviceSnapshot.description && (
          <Typography variant="caption" tone="muted">
            {lineItem.serviceSnapshot.description}
          </Typography>
        )}
        <Typography variant="caption" tone="muted">
          {linePricingLabel(lineItem)}
        </Typography>
      </div>
      <DetailItem label="USD" value={formatUsd(lineItem.totalUsdCents)} />
      <DetailItem label="BYN" value={formatByn(lineItem.totalBynRoundedRubles)} />
    </div>
  )
}

function QuestionnaireDraftCard({
  questionnaire,
}: {
  questionnaire: CalculationRecord['questionnaire']
}) {
  if (!questionnaire) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Черновик ТЗ</CardTitle>
          <CardDescription>
            Подробный опросник для этой заявки еще не заполнен.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="grid gap-2">
          <CardTitle>Черновик ТЗ</CardTitle>
          <CardDescription>
            {questionnaire.progress.answeredCount} из {questionnaire.progress.totalQuestions} вопросов · обновлено{' '}
            {formatDateTime(questionnaire.updatedAt)}
          </CardDescription>
        </div>
        <CardAction className="col-start-1 row-start-auto justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
          <Badge variant="outline">{questionnaire.progress.completionPercent}%</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-4">
          <DetailItem
            label="Заполнено"
            value={`${questionnaire.progress.answeredCount}/${questionnaire.progress.totalQuestions}`}
          />
          <DetailItem label="Свои ответы" value={String(questionnaire.progress.customCount)} />
          <DetailItem label="Пока не знаю" value={String(questionnaire.progress.unknownCount)} />
          <DetailItem label="Пропущено" value={String(questionnaire.progress.skippedCount)} />
        </div>

        <div className="grid gap-4">
          {questionnaire.sections.map((section) => (
            <QuestionnaireSectionDraft key={section.id} section={section} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function QuestionnaireSectionDraft({
  section,
}: {
  section: NonNullable<CalculationRecord['questionnaire']>['sections'][number]
}) {
  const answeredQuestions = section.questions.filter(hasQuestionnaireAnswer)

  return (
    <section className="grid gap-3 rounded-lg border p-4" aria-label={section.title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography variant="bodySmMedium">{section.title}</Typography>
        <Typography variant="caption" tone="muted">
          {answeredQuestions.length}/{section.questions.length}
        </Typography>
      </div>

      {answeredQuestions.length === 0 ? (
        <Typography variant="bodySm" tone="muted">
          В этом разделе пока нет ответов.
        </Typography>
      ) : (
        <div className="grid gap-3">
          {answeredQuestions.map((question) => (
            <div key={question.id} className="grid gap-1 border-t pt-3 first:border-t-0 first:pt-0">
              <Typography variant="caption" tone="muted">
                {question.prompt}
              </Typography>
              <div className="flex flex-wrap items-start gap-2">
                <QuestionnaireAnswerBadge answer={question.answer} />
                <Typography className="min-w-0 break-words" variant="bodySmMedium">
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
  if (answer.kind === 'unknown') return <Badge variant="secondary">Пока не знаю</Badge>
  if (answer.kind === 'skipped') return <Badge variant="secondary">Пропущено</Badge>
  if (answer.kind === 'custom') return <Badge variant="outline">Свой ответ</Badge>
  return <Badge variant="outline">Вариант</Badge>
}

function questionnaireAnswerText(
  answer: NonNullable<
    NonNullable<CalculationRecord['questionnaire']>['sections'][number]['questions'][number]['answer']
  >,
) {
  if (answer.kind === 'unknown') return 'Требует уточнения'
  if (answer.kind === 'skipped') return 'Пользователь пропустил вопрос'
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
    <FieldGroup className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
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
        <Button type="button" variant="outline" onClick={onClear}>
          Сбросить
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

function LeadMetric({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <Card size="sm" className={cn('rounded-lg', muted && 'bg-muted/30')}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="tabular-nums">{numberFormatter.format(value)}</CardTitle>
      </CardHeader>
    </Card>
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
    <Card className="rounded-lg">
      <CardHeader>
        <div className="grid gap-2">
          <CardTitle>Запросы примеров проектов</CardTitle>
          <CardDescription>
            {totalCount > 0
              ? `Последние ${numberFormatter.format(requests.length)} из ${numberFormatter.format(totalCount)}`
              : 'Отдельный поток лидов, которые запросили PDF-примеры после контакта'}
          </CardDescription>
        </div>
        <CardAction className="col-start-1 row-start-auto justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end">
          <Button type="button" variant="outline" onClick={onRefresh}>
            Обновить
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        {isLoading ? (
          <div className="flex items-center gap-3 py-6">
            <Spinner />
            <Typography tone="muted">Загружаем запросы примеров...</Typography>
          </div>
        ) : isError ? (
          <Alert variant="destructive">
            <AlertTitle>Не удалось загрузить запросы примеров</AlertTitle>
            <AlertDescription>{errorMessage(error)}</AlertDescription>
          </Alert>
        ) : requests.length === 0 ? (
          <div className="grid gap-2 rounded-lg border border-dashed p-6">
            <Typography variant="h6">Запросов примеров пока нет</Typography>
            <Typography tone="muted">
              Когда посетитель оставит контакт ради PDF-примера, заявка появится здесь.
            </Typography>
          </div>
        ) : (
          <div className="grid gap-3">
            {requests.map((request) => (
              <div
                key={request.id}
                className="grid gap-3 rounded-lg border p-4 lg:grid-cols-[minmax(160px,220px)_minmax(140px,180px)_minmax(0,1fr)_auto] lg:items-center"
              >
                <div className="grid gap-1">
                  <Typography variant="bodySmMedium">{request.clientName}</Typography>
                  <Typography variant="caption" tone="muted">
                    {formatDateTime(request.createdAt)}
                  </Typography>
                </div>
                <Typography className="tabular-nums" variant="bodySm">
                  {request.clientPhone}
                </Typography>
                <div className="grid gap-1">
                  <Typography variant="caption" tone="muted">
                    Источник: {leadSourceLabel(request.source)}
                  </Typography>
                  <Typography variant="bodySm">
                    {request.requestedExamples.map((example) => example.code).join(', ')}
                  </Typography>
                  <TelegramDeliveryLog deliveries={request.telegramDeliveries} />
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {request.requestedExamples.map((example) => (
                    <Button key={example.slug} asChild type="button" variant="outline" size="sm">
                      <a
                        href={buildApiUrl(example.urlPath)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Открыть ${example.title} для ${request.clientName}`}
                      >
                        <Typography as="span" variant="control">
                          {example.code} PDF
                        </Typography>
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <Typography variant="caption" tone="muted">
        {label}
      </Typography>
      <Typography variant="bodySmMedium">{value}</Typography>
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
  if (!artifact) return <Typography tone="muted">Нет КП</Typography>
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
        <Typography as="span" variant="control">
          {label}
        </Typography>
      </a>
    </Button>
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

function servicesSummary(services: CalculationListItem['serviceSnapshots']) {
  if (services.length === 0) return 'Нет услуг'
  const visible = services.slice(0, 2).map((service) => service.title).join(', ')
  return services.length > 2 ? `${visible} +${services.length - 2}` : visible
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

function latestTelegramDelivery(deliveries: readonly TelegramDeliveryRecord[]) {
  return deliveries.length > 0 ? deliveries[deliveries.length - 1] : null
}

function telegramDeliveryBadgeVariant(status: TelegramDeliveryRecord['status']) {
  if (status === 'sent') return 'default'
  if (status === 'failed') return 'destructive'
  if (status === 'pending_start') return 'outline'
  return 'secondary'
}

function telegramDeliveryTargetLabel(targetType: TelegramDeliveryRecord['targetType']) {
  if (targetType === 'proposal') return 'КП/PDF'
  return 'Примеры проектов'
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
  if (delivery.telegramUserId) return `Telegram user ${delivery.telegramUserId}`
  if (delivery.telegramChatId) return `Telegram chat ${delivery.telegramChatId}`
  return 'Telegram chat еще не привязан'
}

function calculationStatus(value: string): CalculationStatus {
  if (statusOptions.some((status) => status === value)) {
    return value as CalculationStatus
  }
  return 'new'
}

function formatDateTime(value: string) {
  return dateTimeFormatter.format(new Date(value))
}

function formatByn(rubles: number) {
  return `${numberFormatter.format(rubles)} BYN`
}

function formatUsd(cents: number) {
  const value = cents / 100
  const formatted = value % 1 === 0
    ? numberFormatter.format(value)
    : new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)

  return `~${formatted} USD`
}

function linePricingLabel(lineItem: CalculationLineItem) {
  if (lineItem.quantity.kind === 'fixed') return 'Фиксированная'
  return `${formatArea(lineItem.quantity.areaSqm)} x ${formatUsd(lineItem.unitPriceUsdCents)}`
}

function pricingTypeLabel(pricingType: CalculationRecord['serviceSnapshots'][number]['pricingType']) {
  if (pricingType === 'fixed') return 'Фиксированная'
  if (pricingType === 'per_sqm') return 'За м²'
  return 'Формула'
}

function formatArea(value: string | number) {
  return `${value} м²`
}

function exchangeRateSourceLabel(source: string) {
  if (source === 'manual') return 'вручную'
  if (source === 'nbrb') return 'НБ РБ'
  return source
}

function leadSourceLabel(source: string | null) {
  if (source === 'example_request') return 'Запрос примера проекта'
  if (source === 'public_questionnaire') return 'Подробный опросник'
  if (source === 'public_offer_preliminary') return 'Предварительное КП'
  if (source === 'public_website') return 'Публичный сайт'
  if (source === 'public_calculator') return 'Калькулятор'
  return source ?? 'Не указан'
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неожиданная ошибка'
}
