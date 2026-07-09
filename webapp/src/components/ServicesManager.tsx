import {
  convertUsdCentsToBynCents,
  roundBynCentsToRubles,
  type ServiceRecord,
} from '@poznyak-engineering-calculator/contracts'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons'
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Spinner } from '@/components/ui/spinner'
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

const numberFormatter = new Intl.NumberFormat('ru-RU')
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
  const [dialogOpen, setDialogOpen] = useState(false)
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

  function openCreateDialog() {
    setEditingService(null)
    setFormState({
      ...defaultFormState,
      sortOrder: String(nextSortOrder),
    })
    setFormError(null)
    setDialogOpen(true)
  }

  function openEditDialog(service: ServiceRecord) {
    if (!isSupportedPricingType(service.pricingType)) {
      setActionError('Formula services are future scope. Archive or reorder them for now.')
      return
    }

    setEditingService(service)
    setFormState(formStateFromService(service))
    setFormError(null)
    setDialogOpen(true)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)

    const priceUsdCents = parseUsdCents(formState.priceUsd)
    if (priceUsdCents === null) {
      setFormError('Enter a positive USD price with up to two decimals.')
      return
    }

    const sortOrder = Number(formState.sortOrder)
    if (!Number.isInteger(sortOrder) || sortOrder < -1_000_000 || sortOrder > 1_000_000) {
      setFormError('Sort order must be an integer between -1000000 and 1000000.')
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

      setDialogOpen(false)
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
    <section className="grid gap-6" aria-labelledby="services-heading">
      <div className="grid gap-4 sm:grid-cols-3">
        <ServiceMetric label="Active services" value={activeCount} />
        <ServiceMetric label="Public calculator" value={publicCount} />
        <ServiceMetric label="Archived" value={archivedCount} />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <div className="grid gap-2">
            <CardTitle id="services-heading">Services and prices</CardTitle>
            <CardDescription>
              Base prices are stored in USD. BYN previews use the current admin exchange rate.
            </CardDescription>
          </div>
          <CardAction>
            <Button type="button" onClick={openCreateDialog}>
              Add service
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          {exchangeRateQuery.isError && (
            <Alert>
              <AlertTitle>BYN preview unavailable</AlertTitle>
              <AlertDescription>
                Configure the USD/BYN exchange rate in settings to show BYN previews. Service CRUD
                stays available.
              </AlertDescription>
            </Alert>
          )}

          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Service action failed</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {servicesQuery.isLoading ? (
            <div className="flex items-center gap-3 py-8">
              <Spinner />
              <Typography tone="muted">Loading services...</Typography>
            </div>
          ) : servicesQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load services</AlertTitle>
              <AlertDescription>{errorMessage(servicesQuery.error)}</AlertDescription>
            </Alert>
          ) : sortedServices.length === 0 ? (
            <div className="grid gap-3 rounded-lg border border-dashed p-8">
              <Typography variant="h6">No services yet</Typography>
              <Typography tone="muted">
                Add the first service to publish it in the public calculator.
              </Typography>
              <Button type="button" className="w-fit" onClick={openCreateDialog}>
                Add service
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Order</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Pricing</TableHead>
                  <TableHead>USD</TableHead>
                  <TableHead>BYN preview</TableHead>
                  <TableHead>Public</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedServices.map((service, index) => (
                  <TableRow
                    key={service.id}
                    className={cn(!service.isActive && 'bg-muted/30 text-muted-foreground')}
                  >
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Move ${service.title} up`}
                          disabled={index === 0 || isMutating}
                          onClick={() => void moveService(service, -1)}
                        >
                          <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Move ${service.title} down`}
                          disabled={index === sortedServices.length - 1 || isMutating}
                          onClick={() => void moveService(service, 1)}
                        >
                          <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
                        </Button>
                        <Typography as="span" variant="controlXs" tone="muted">
                          {service.sortOrder}
                        </Typography>
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[260px] whitespace-normal">
                      <div className="grid gap-1">
                        <Typography variant="bodySmMedium">{service.title}</Typography>
                        {service.description && (
                          <Typography variant="caption" tone="muted">
                            {service.description}
                          </Typography>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{pricingTypeLabel(service.pricingType)}</TableCell>
                    <TableCell>{formatUsdPrice(service)}</TableCell>
                    <TableCell>{formatBynPreview(service, exchangeRate)}</TableCell>
                    <TableCell>
                      <Switch
                        aria-label={`Public visibility for ${service.title}`}
                        checked={service.isPublic && isSupportedPricingType(service.pricingType)}
                        disabled={
                          !service.isActive ||
                          !isSupportedPricingType(service.pricingType) ||
                          updateService.isPending
                        }
                        onCheckedChange={(checked) => void toggleVisibility(service, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={service.isActive ? 'outline' : 'secondary'}>
                        {service.isActive ? 'Active' : 'Archived'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!isSupportedPricingType(service.pricingType)}
                          title={
                            isSupportedPricingType(service.pricingType)
                              ? undefined
                              : 'Formula editor is future scope'
                          }
                          onClick={() => openEditDialog(service)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant={confirmArchiveId === service.id ? 'destructive' : 'ghost'}
                          size="sm"
                          disabled={updateService.isPending}
                          onClick={() => void toggleArchive(service)}
                        >
                          {service.isActive
                            ? confirmArchiveId === service.id ? 'Confirm archive' : 'Archive'
                            : 'Restore'}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <form className="grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
            <DialogHeader>
              <DialogTitle>{editingService ? 'Edit service' : 'Add service'}</DialogTitle>
              <DialogDescription>
                Fixed and per-square-meter services require a positive base USD price.
              </DialogDescription>
            </DialogHeader>

            {formError && (
              <Alert variant="destructive">
                <AlertTitle>Could not save service</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <FieldGroup className="gap-4">
              <Field>
                <FieldLabel htmlFor="service-title">Title</FieldLabel>
                <Input
                  id="service-title"
                  value={formState.title}
                  onChange={(event) => setFormState({ ...formState, title: event.target.value })}
                  autoComplete="off"
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="service-description">Description</FieldLabel>
                <Textarea
                  id="service-description"
                  value={formState.description}
                  onChange={(event) =>
                    setFormState({ ...formState, description: event.target.value })
                  }
                  rows={3}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="service-pricing-type">Pricing type</FieldLabel>
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
                      <SelectItem value="per_sqm">Per square meter</SelectItem>
                      <SelectItem value="fixed">Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel htmlFor="service-price-usd">USD price</FieldLabel>
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
                    {formState.pricingType === 'per_sqm' ? 'USD per m2.' : 'Fixed USD total.'}
                  </FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="service-sort-order">Sort order</FieldLabel>
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
                <div className="grid gap-1">
                  <FieldLabel htmlFor="service-public">Show in public calculator</FieldLabel>
                  <FieldDescription>
                    Archived services are hidden automatically even if this switch was on.
                  </FieldDescription>
                </div>
              </Field>
            </FieldGroup>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save service'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ServiceMetric({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm" className="rounded-lg">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle>{numberFormatter.format(value)}</CardTitle>
      </CardHeader>
    </Card>
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
  if (pricingType === 'fixed') return 'Fixed'
  if (pricingType === 'per_sqm') return 'Per m2'
  return 'Formula'
}

function formatUsdPrice(service: ServiceRecord) {
  const suffix = service.pricingType === 'per_sqm' ? '/m2' : ''
  return `${formatUsdInput(service.priceUsdCents)} $${suffix}`
}

function formatBynPreview(
  service: ServiceRecord,
  exchangeRate: { usdToBynRateScaled: number } | null,
) {
  if (!exchangeRate) return 'No rate'
  if (!isSupportedPricingType(service.pricingType)) return 'Future formula'

  const bynCents = convertUsdCentsToBynCents(
    service.priceUsdCents,
    exchangeRate.usdToBynRateScaled,
  )
  const rubles = roundBynCentsToRubles(bynCents)
  const suffix = service.pricingType === 'per_sqm' ? '/m2' : ''

  return `${numberFormatter.format(rubles)} Br${suffix}`
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
  return 'Unexpected error'
}
