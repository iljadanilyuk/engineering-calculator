import {
  convertUsdCentsToBynCents,
  roundBynCentsToRubles,
  type ServiceRecord,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  useCreateServiceMutation,
  useExchangeRateQuery,
  useReorderServicesMutation,
  useServicesQuery,
  useUpdateServiceMutation,
} from '@/lib/services-queries'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type ServiceFormState = {
  title: string
  description: string
  pricingType: 'fixed' | 'per_sqm'
  priceUsd: string
  sortOrder: string
  isPublic: boolean
}

const defaultFormState: ServiceFormState = {
  title: '',
  description: '',
  pricingType: 'per_sqm',
  priceUsd: '',
  sortOrder: '10',
  isPublic: true,
}

const emptyServices: ServiceRecord[] = []

export function ServicesManager() {
  const auth = useAuth()
  const servicesQuery = useServicesQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const exchangeRateQuery = useExchangeRateQuery({
    api: auth.api,
    enabled: auth.isAuthenticated,
  })
  const createService = useCreateServiceMutation({ api: auth.api })
  const updateService = useUpdateServiceMutation({ api: auth.api })
  const reorderServices = useReorderServicesMutation({ api: auth.api })
  const services = servicesQuery.data?.services ?? emptyServices
  const sortedServices = useMemo(() => sortServices(services), [services])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceRecord | null>(null)
  const [formState, setFormState] = useState<ServiceFormState>(defaultFormState)
  const [formError, setFormError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null)

  const activeCount = services.filter((service) => service.isActive).length
  const publicCount = services.filter(
    (service) => service.isActive && service.isPublic && isSupportedPricingType(service.pricingType),
  ).length
  const archivedCount = services.length - activeCount
  const nextSortOrder = nextServiceSortOrder(sortedServices)
  const isSaving = createService.isPending || updateService.isPending
  const isMutating = updateService.isPending || reorderServices.isPending
  const exchangeRate = exchangeRateQuery.data?.exchangeRate ?? null

  function openCreateDrawer() {
    setEditingService(null)
    setFormState({
      ...defaultFormState,
      sortOrder: String(nextSortOrder),
    })
    setFormError(null)
    setDrawerOpen(true)
  }

  function openEditDrawer(service: ServiceRecord) {
    if (!isSupportedPricingType(service.pricingType)) {
      setActionError('Формульные услуги недоступны для ручного редактирования. Их можно архивировать или менять порядок.')
      return
    }

    setEditingService(service)
    setFormState(formStateFromService(service))
    setFormError(null)
    setDrawerOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const priceUsdCents = parseUsdCents(formState.priceUsd)
    if (priceUsdCents === null) {
      setFormError('Введите положительную цену в USD, максимум с двумя знаками после запятой.')
      return
    }

    const sortOrder = Number(formState.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < -1_000_000 || sortOrder > 1_000_000) {
      setFormError('Порядок должен быть целым числом от -1000000 до 1000000.')
      return
    }

    try {
      const payload = {
        title: formState.title,
        description: formState.description,
        pricingType: formState.pricingType,
        priceUsdCents,
        isPublic: formState.isPublic,
        sortOrder,
      }

      if (editingService) {
        await updateService.mutateAsync({
          id: editingService.id,
          input: payload,
        })
      } else {
        await createService.mutateAsync({
          ...payload,
          isActive: true,
        })
      }

      setDrawerOpen(false)
      setEditingService(null)
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  async function toggleVisibility(service: ServiceRecord, isPublic: boolean) {
    if (!service.isActive || !isSupportedPricingType(service.pricingType)) return
    setActionError(null)
    setConfirmArchiveId(null)

    try {
      await updateService.mutateAsync({
        id: service.id,
        input: { isPublic },
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function toggleArchive(service: ServiceRecord) {
    setActionError(null)

    if (service.isActive && confirmArchiveId !== service.id) {
      setConfirmArchiveId(service.id)
      return
    }

    try {
      await updateService.mutateAsync({
        id: service.id,
        input: service.isActive ? { isActive: false } : { isActive: true },
      })
      setConfirmArchiveId(null)
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  async function moveService(service: ServiceRecord, direction: -1 | 1) {
    const currentIndex = sortedServices.findIndex((item) => item.id === service.id)
    const nextIndex = currentIndex + direction

    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= sortedServices.length) return

    const reordered = [...sortedServices]
    const [removed] = reordered.splice(currentIndex, 1)
    reordered.splice(nextIndex, 0, removed)
    setActionError(null)
    setConfirmArchiveId(null)

    try {
      await reorderServices.mutateAsync({
        services: reordered.map((item, index) => ({
          id: item.id,
          sortOrder: (index + 1) * 10,
        })),
      })
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  return (
    <section className="admin-view" aria-labelledby="services-heading">
      <AdminPageHeader
        eyebrow="Настройка продукта"
        title="Услуги и цены"
        description="Тарифная сетка хранит базовую USD-ставку и показывает, какие услуги доступны в публичном калькуляторе."
        actions={
          <Button type="button" onClick={openCreateDrawer}>
            Добавить услугу
          </Button>
        }
      />

      <div className="admin-priority-strip">
        <MetricTile label="Активные" value={activeCount} tone="blue" />
        <MetricTile label="В калькуляторе" value={publicCount} tone="green" />
        <MetricTile label="Архив" value={archivedCount} tone="gray" />
      </div>

      <AdminPanel
        title="Тарифная сетка"
        description="Таблица по умолчанию работает в режиме просмотра; редактирование открывается в боковой панели."
        action={<ExchangeRateBadge exchangeRate={exchangeRate} updatedAt={exchangeRateQuery.data?.updatedAt ?? null} />}
      >
        <div className="admin-stack">
          {exchangeRateQuery.isError && (
            <Alert>
              <AlertTitle>Предпросмотр BYN недоступен</AlertTitle>
              <AlertDescription>
                Настройте курс USD/BYN, чтобы видеть пересчет. Редактирование услуг остается доступным.
              </AlertDescription>
            </Alert>
          )}

          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Не удалось выполнить действие с услугой</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {servicesQuery.isLoading ? (
            <LoadingBlock label="Загружаем услуги..." />
          ) : servicesQuery.isError ? (
            <ErrorBlock
              title="Не удалось загрузить услуги"
              description={errorMessage(servicesQuery.error)}
              onRetry={() => void servicesQuery.refetch()}
            />
          ) : sortedServices.length === 0 ? (
            <EmptyState
              title="Услуг пока нет"
              description="Добавьте первую услугу, чтобы показать ее в публичном калькуляторе."
              action={
                <Button type="button" onClick={openCreateDrawer}>
                  Добавить услугу
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
                      <TableHead>Услуга и описание</TableHead>
                      <TableHead>Тип расчета</TableHead>
                      <TableHead>Частный дом, USD</TableHead>
                      <TableHead>Коммерческий объект, USD</TableHead>
                      <TableHead>Цена в калькуляторе, BYN</TableHead>
                      <TableHead>Видимость</TableHead>
                      <TableHead>Статус</TableHead>
                      <TableHead className="text-right">Действия</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedServices.map((service, index) => (
                      <TableRow key={service.id} className={cn(!service.isActive && 'bg-muted/30 text-muted-foreground')}>
                        <TableCell>
                          <ServiceOrderControls
                            service={service}
                            index={index}
                            total={sortedServices.length}
                            disabled={isMutating}
                            onMove={moveService}
                          />
                        </TableCell>
                        <TableCell className="min-w-[240px] whitespace-normal">
                          <ServiceTitle service={service} />
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={service.pricingType === 'formula' ? 'gray' : 'blue'}>
                            {pricingTypeLabel(service.pricingType)}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatUsdPrice(service)}</TableCell>
                        <TableCell className="whitespace-nowrap">{commercialPriceLabel(service)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatBynPreview(service, exchangeRate)}</TableCell>
                        <TableCell>
                          <ServicePublicSwitch
                            service={service}
                            disabled={updateService.isPending}
                            onChange={toggleVisibility}
                          />
                        </TableCell>
                        <TableCell>
                          <ServiceStatusBadge service={service} />
                        </TableCell>
                        <TableCell>
                          <ServiceActions
                            service={service}
                            confirmArchiveId={confirmArchiveId}
                            disabled={updateService.isPending}
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
                {sortedServices.map((service, index) => (
                  <ServiceMobileCard
                    key={service.id}
                    service={service}
                    index={index}
                    total={sortedServices.length}
                    exchangeRate={exchangeRate}
                    confirmArchiveId={confirmArchiveId}
                    orderDisabled={isMutating}
                    updateDisabled={updateService.isPending}
                    onMove={moveService}
                    onVisibilityChange={toggleVisibility}
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
        <SheetContent className="admin-drawer" side="right">
          <form className="admin-drawer-form" onSubmit={(event) => void handleSubmit(event)}>
            <SheetHeader>
              <SheetTitle>{editingService ? 'Редактировать услугу' : 'Добавить услугу'}</SheetTitle>
              <SheetDescription>
                Для фиксированных услуг и цены за м² нужна положительная базовая цена в USD.
              </SheetDescription>
            </SheetHeader>

            <div className="admin-drawer-body">
              {formError && (
                <Alert variant="destructive">
                  <AlertTitle>Не удалось сохранить услугу</AlertTitle>
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <FieldGroup className="admin-form-grid">
                <Field>
                  <FieldLabel htmlFor="service-title">Название</FieldLabel>
                  <Input
                    id="service-title"
                    value={formState.title}
                    onChange={(event) => setFormState({ ...formState, title: event.target.value })}
                    autoComplete="off"
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="service-description">Описание</FieldLabel>
                  <Textarea
                    id="service-description"
                    value={formState.description}
                    onChange={(event) =>
                      setFormState({ ...formState, description: event.target.value })
                    }
                    rows={4}
                  />
                </Field>

                <div className="admin-drawer-grid">
                  <Field>
                    <FieldLabel htmlFor="service-pricing-type">Тип расчета</FieldLabel>
                    <Select
                      value={formState.pricingType}
                      onValueChange={(value) =>
                        setFormState({
                          ...formState,
                          pricingType: value === 'fixed' ? 'fixed' : 'per_sqm',
                        })
                      }
                    >
                      <SelectTrigger id="service-pricing-type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_sqm">За м²</SelectItem>
                        <SelectItem value="fixed">Фиксированная</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="service-price-usd">Цена в USD</FieldLabel>
                    <Input
                      id="service-price-usd"
                      value={formState.priceUsd}
                      onChange={(event) =>
                        setFormState({ ...formState, priceUsd: event.target.value })
                      }
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="250"
                      required
                    />
                    <FieldDescription>
                      {formState.pricingType === 'per_sqm' ? 'USD за м².' : 'Фиксированная сумма в USD.'}
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="service-sort-order">Порядок</FieldLabel>
                    <Input
                      id="service-sort-order"
                      value={formState.sortOrder}
                      onChange={(event) =>
                        setFormState({ ...formState, sortOrder: event.target.value })
                      }
                      inputMode="numeric"
                      autoComplete="off"
                      required
                    />
                  </Field>
                </div>

                <Field orientation="horizontal">
                  <Switch
                    id="service-public"
                    checked={formState.isPublic}
                    onCheckedChange={(checked) => setFormState({ ...formState, isPublic: checked })}
                  />
                  <div className="admin-field-copy">
                    <FieldLabel htmlFor="service-public">Показывать в калькуляторе</FieldLabel>
                    <FieldDescription>
                      Архивные услуги скрываются автоматически, даже если переключатель включен.
                    </FieldDescription>
                  </div>
                </Field>
              </FieldGroup>
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Сохраняем...' : 'Сохранить услугу'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  )
}

function ExchangeRateBadge({
  exchangeRate,
  updatedAt,
}: {
  exchangeRate: { usdToBynRate: string } | null
  updatedAt: string | null
}) {
  if (!exchangeRate) return <StatusPill tone="amber">Курс не задан</StatusPill>

  return (
    <div className="admin-rate-strip">
      <StatusPill tone="blue">{`${exchangeRate.usdToBynRate} BYN/USD`}</StatusPill>
      <StatusPill tone="gray">Округление до BYN</StatusPill>
      {updatedAt && <StatusPill tone="gray">{new Date(updatedAt).toLocaleDateString('ru-RU')}</StatusPill>}
    </div>
  )
}

function ServiceOrderControls({
  service,
  index,
  total,
  disabled,
  onMove,
}: {
  service: ServiceRecord
  index: number
  total: number
  disabled: boolean
  onMove: (service: ServiceRecord, direction: -1 | 1) => void | Promise<void>
}) {
  return (
    <div className="admin-order-control">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Переместить ${service.title} выше`}
        disabled={index === 0 || disabled}
        onClick={() => void onMove(service, -1)}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Переместить ${service.title} ниже`}
        disabled={index === total - 1 || disabled}
        onClick={() => void onMove(service, 1)}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
      </Button>
      <Typography className="numeric" variant="controlXs" tone="muted">{String(service.sortOrder)}</Typography>
    </div>
  )
}

function ServiceTitle({ service }: { service: ServiceRecord }) {
  return (
    <div className="admin-service-title">
      <Typography variant="bodySmMedium">{service.title}</Typography>
      {service.description && (
        <Typography variant="caption" tone="muted">{service.description}</Typography>
      )}
    </div>
  )
}

function ServicePublicSwitch({
  service,
  disabled,
  onChange,
}: {
  service: ServiceRecord
  disabled: boolean
  onChange: (service: ServiceRecord, isPublic: boolean) => void | Promise<void>
}) {
  return (
    <Switch
      aria-label={`Показывать в калькуляторе: ${service.title}`}
      checked={service.isPublic && isSupportedPricingType(service.pricingType)}
      disabled={
        !service.isActive ||
        !isSupportedPricingType(service.pricingType) ||
        disabled
      }
      onCheckedChange={(checked) => void onChange(service, checked)}
    />
  )
}

function ServiceStatusBadge({ service }: { service: ServiceRecord }) {
  return (
    <StatusPill tone={service.isActive ? 'green' : 'gray'}>
      {service.isActive ? 'Активна' : 'В архиве'}
    </StatusPill>
  )
}

function ServiceActions({
  service,
  confirmArchiveId,
  disabled,
  onEdit,
  onArchive,
}: {
  service: ServiceRecord
  confirmArchiveId: string | null
  disabled: boolean
  onEdit: (service: ServiceRecord) => void
  onArchive: (service: ServiceRecord) => void | Promise<void>
}) {
  return (
    <div className="admin-row-actions">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!isSupportedPricingType(service.pricingType)}
        title={
          isSupportedPricingType(service.pricingType)
            ? undefined
            : 'Формульные услуги недоступны для ручного редактирования'
        }
        onClick={() => onEdit(service)}
      >
        Редактировать
      </Button>
      <Button
        type="button"
        variant={confirmArchiveId === service.id ? 'destructive' : 'ghost'}
        size="sm"
        disabled={disabled}
        onClick={() => void onArchive(service)}
      >
        {service.isActive
          ? confirmArchiveId === service.id ? 'Подтвердить архив' : 'В архив'
          : 'Вернуть'}
      </Button>
    </div>
  )
}

function ServiceMobileCard({
  service,
  index,
  total,
  exchangeRate,
  confirmArchiveId,
  orderDisabled,
  updateDisabled,
  onMove,
  onVisibilityChange,
  onEdit,
  onArchive,
}: {
  service: ServiceRecord
  index: number
  total: number
  exchangeRate: { usdToBynRateScaled: number } | null
  confirmArchiveId: string | null
  orderDisabled: boolean
  updateDisabled: boolean
  onMove: (service: ServiceRecord, direction: -1 | 1) => void | Promise<void>
  onVisibilityChange: (service: ServiceRecord, isPublic: boolean) => void | Promise<void>
  onEdit: (service: ServiceRecord) => void
  onArchive: (service: ServiceRecord) => void | Promise<void>
}) {
  return (
    <article className={cn('admin-mobile-card', !service.isActive && 'is-muted')}>
      <div className="admin-mobile-card-head">
        <ServiceTitle service={service} />
        <ServiceStatusBadge service={service} />
      </div>

      <div className="admin-property-grid">
        <ServiceMobileFact label="Расчет" value={pricingTypeLabel(service.pricingType)} />
        <ServiceMobileFact label="Частный дом" value={formatUsdPrice(service)} />
        <ServiceMobileFact label="Коммерческий" value={commercialPriceLabel(service)} />
        <ServiceMobileFact label="Цена в калькуляторе" value={formatBynPreview(service, exchangeRate)} />
      </div>

      <div className="admin-mobile-card-actions split">
        <div className="admin-switch-line">
          <Typography variant="bodySmMedium">Показывать в калькуляторе</Typography>
          <ServicePublicSwitch
            service={service}
            disabled={updateDisabled}
            onChange={onVisibilityChange}
          />
        </div>
        <ServiceOrderControls
          service={service}
          index={index}
          total={total}
          disabled={orderDisabled}
          onMove={onMove}
        />
        <ServiceActions
          service={service}
          confirmArchiveId={confirmArchiveId}
          disabled={updateDisabled}
          onEdit={onEdit}
          onArchive={onArchive}
        />
      </div>
    </article>
  )
}

function ServiceMobileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-detail-item">
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography className="numeric" variant="bodySmMedium">{value}</Typography>
    </div>
  )
}

function sortServices(services: ServiceRecord[]) {
  return [...services].sort((first, second) => {
    if (first.sortOrder !== second.sortOrder) return first.sortOrder - second.sortOrder
    return first.createdAt.localeCompare(second.createdAt)
  })
}

function nextServiceSortOrder(services: ServiceRecord[]) {
  const maxSortOrder = services.reduce((max, service) => Math.max(max, service.sortOrder), 0)
  return maxSortOrder + 10
}

function formStateFromService(service: ServiceRecord): ServiceFormState {
  return {
    title: service.title,
    description: service.description ?? '',
    pricingType: service.pricingType === 'fixed' ? 'fixed' : 'per_sqm',
    priceUsd: formatUsdInput(service.priceUsdCents),
    sortOrder: String(service.sortOrder),
    isPublic: service.isPublic,
  }
}

function isSupportedPricingType(pricingType: ServiceRecord['pricingType']) {
  return pricingType === 'fixed' || pricingType === 'per_sqm'
}

function pricingTypeLabel(pricingType: ServiceRecord['pricingType']) {
  if (pricingType === 'fixed') return 'Фиксированная'
  if (pricingType === 'per_sqm') return 'За м²'
  return 'Формула'
}

function formatUsdPrice(service: ServiceRecord) {
  const suffix = service.pricingType === 'per_sqm' ? '/м²' : ''
  return `${formatUsdInput(service.priceUsdCents)} USD${suffix}`
}

function commercialPriceLabel(service: ServiceRecord) {
  if (!isSupportedPricingType(service.pricingType)) return 'Формульный расчет'
  return 'Не задано'
}

function formatBynPreview(
  service: ServiceRecord,
  exchangeRate: { usdToBynRateScaled: number } | null,
) {
  if (!exchangeRate) return 'Курс не задан'
  if (!isSupportedPricingType(service.pricingType)) return 'Формульный расчет'

  const bynCents = convertUsdCentsToBynCents(
    service.priceUsdCents,
    exchangeRate.usdToBynRateScaled,
  )
  const rubles = roundBynCentsToRubles(bynCents)
  const suffix = service.pricingType === 'per_sqm' ? '/м²' : ''

  return `${numberFormatter.format(rubles)} BYN${suffix}`
}

function parseUsdCents(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(normalized)) return null

  const [wholePart, fractionPart = ''] = normalized.split('.')
  const cents = Number(wholePart) * 100 + Number(fractionPart.padEnd(2, '0'))

  return Number.isSafeInteger(cents) && cents > 0 ? cents : null
}

function formatUsdInput(cents: number) {
  const whole = Math.floor(cents / 100)
  const fraction = cents % 100

  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0')}`
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Неожиданная ошибка'
}
