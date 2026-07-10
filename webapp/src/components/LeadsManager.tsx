import type {
  CalculationLineItem,
  CalculationListItem,
  CalculationRecord,
  CalculationStatus,
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
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  won: 'Won',
  lost: 'Lost',
  spam_test: 'Spam/Test',
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
        <LeadMetric label="Active leads" value={summary?.activeCount ?? 0} />
        <LeadMetric label="New" value={summary?.statusCounts.new ?? 0} />
        <LeadMetric label="Won" value={summary?.statusCounts.won ?? 0} />
        <LeadMetric label="Spam/Test" value={summary?.spamTestCount ?? 0} muted />
      </div>

      <Card className="rounded-lg">
        <CardHeader>
          <div className="grid gap-2">
            <CardTitle id="leads-heading">Submitted calculations</CardTitle>
            <CardDescription>
              {summary
                ? `${numberFormatter.format(pageRange?.start ?? 0)}-${numberFormatter.format(pageRange?.end ?? 0)} of ${numberFormatter.format(summary.filteredCount)} filtered · ${numberFormatter.format(summary.totalCount)} total`
                : 'Loading submitted calculations'}
            </CardDescription>
          </div>
          <CardAction>
            <Button type="button" variant="outline" onClick={() => void leadsQuery.refetch()}>
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LeadFilters filters={filters} onChange={updateFilters} onClear={clearFilters} />

          {actionError && (
            <Alert variant="destructive">
              <AlertTitle>Lead update failed</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}

          {leadsQuery.isLoading ? (
            <div className="flex items-center gap-3 py-8">
              <Spinner />
              <Typography tone="muted">Loading leads...</Typography>
            </div>
          ) : leadsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load leads</AlertTitle>
              <AlertDescription>{errorMessage(leadsQuery.error)}</AlertDescription>
            </Alert>
          ) : leads.length === 0 ? (
            <div className="grid gap-3 rounded-lg border border-dashed p-8">
              <Typography variant="h6">No submitted calculations</Typography>
              <Typography tone="muted">Change filters or submit a public calculation first.</Typography>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[1120px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Created</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Selected services</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total BYN</TableHead>
                    <TableHead>USD</TableHead>
                    <TableHead>Proposal</TableHead>
                    <TableHead className="text-right">Detail</TableHead>
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
                      <TableCell className="min-w-[180px] whitespace-normal">
                        <div className="grid gap-1">
                          <Typography variant="bodySmMedium">{lead.clientName}</Typography>
                          {lead.objectName && (
                            <Typography variant="caption" tone="muted">
                              {lead.objectName}
                            </Typography>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{lead.clientPhone}</TableCell>
                      <TableCell className="whitespace-nowrap">{lead.areaSqm} m2</TableCell>
                      <TableCell className="min-w-[240px] whitespace-normal">
                        {servicesSummary(lead.serviceSnapshots)}
                      </TableCell>
                      <TableCell>
                        <LeadStatusSelect
                          value={lead.status}
                          label={`Status for ${lead.clientName}`}
                          disabled={updateLead.isPending}
                          onChange={(status) => void changeStatus(lead, status)}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Typography variant="bodySmMedium">
                          {formatByn(lead.totalBynRoundedRubles)}
                        </Typography>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatUsd(lead.totalUsdCents)}
                      </TableCell>
                      <TableCell>
                        <ProposalLink lead={lead} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link to="/app/leads/$leadId" params={{ leadId: lead.id }}>
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {summary && summary.filteredCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <Typography variant="bodySm" tone="muted">
                Showing {numberFormatter.format(pageRange?.start ?? 0)}-{numberFormatter.format(pageRange?.end ?? 0)} of{' '}
                {numberFormatter.format(summary.filteredCount)} filtered leads
              </Typography>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pageRange?.canGoPrevious || leadsQuery.isFetching}
                  onClick={() => setOffset(Math.max(0, offset - summary.limit))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!pageRange?.canGoNext || leadsQuery.isFetching}
                  onClick={() => setOffset(offset + summary.limit)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
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
      setSavedMessage('Status saved')
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
      setSavedMessage('Notes saved')
    } catch (error) {
      setActionError(errorMessage(error))
    }
  }

  if (leadQuery.isLoading) {
    return (
      <section className="flex items-center gap-3 py-8" aria-label="Loading lead">
        <Spinner />
        <Typography tone="muted">Loading lead...</Typography>
      </section>
    )
  }

  if (leadQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load lead</AlertTitle>
        <AlertDescription>{errorMessage(leadQuery.error)}</AlertDescription>
      </Alert>
    )
  }

  if (!lead) return null

  return (
    <section className="grid gap-6" aria-labelledby="lead-detail-heading">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild type="button" variant="outline" size="sm">
          <Link to="/app/leads">Back to leads</Link>
        </Button>
        <Badge variant={lead.status === 'spam_test' ? 'secondary' : 'outline'}>
          {statusLabels[lead.status]}
        </Badge>
      </div>

      {actionError && (
        <Alert variant="destructive">
          <AlertTitle>Lead update failed</AlertTitle>
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      )}

      {savedMessage && (
        <Alert>
          <AlertTitle>{savedMessage}</AlertTitle>
          <AlertDescription>Latest admin changes are stored.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-6">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="grid gap-2">
                <CardTitle id="lead-detail-heading">{lead.clientName}</CardTitle>
                <CardDescription>
                  Created {formatDateTime(lead.createdAt)} · Updated {formatDateTime(lead.updatedAt)}
                </CardDescription>
              </div>
              <CardAction>
                <ProposalLink
                  lead={lead}
                  preferredLabel={hasPdfArtifact(lead.proposalArtifacts[0]) ? 'Open original PDF' : 'Open proposal'}
                />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <DetailItem label="Phone" value={lead.clientPhone} />
              <DetailItem label="Object" value={lead.objectName ?? 'Not specified'} />
              <DetailItem label="Area" value={`${lead.areaSqm} m2`} />
              <DetailItem label="Offer total" value={`${formatByn(lead.totalBynRoundedRubles)} · ${formatUsd(lead.totalUsdCents)}`} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Calculation breakdown</CardTitle>
              <CardDescription>
                Exchange rate {lead.exchangeRate.usdToBynRate} BYN/USD · {lead.exchangeRate.source}
                {lead.exchangeRate.asOf ? ` · ${formatDateTime(lead.exchangeRate.asOf)}` : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service snapshot</TableHead>
                      <TableHead>Pricing</TableHead>
                      <TableHead>USD</TableHead>
                      <TableHead>BYN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lead.calculationSnapshot.lineItems.map((lineItem) => (
                      <TableRow key={lineItem.serviceId}>
                        <TableCell className="min-w-[280px] whitespace-normal">
                          <div className="grid gap-1">
                            <Typography variant="bodySmMedium">
                              {lineItem.serviceSnapshot.title}
                            </Typography>
                            {lineItem.serviceSnapshot.description && (
                              <Typography variant="caption" tone="muted">
                                {lineItem.serviceSnapshot.description}
                              </Typography>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{linePricingLabel(lineItem)}</TableCell>
                        <TableCell>{formatUsd(lineItem.totalUsdCents)}</TableCell>
                        <TableCell>{formatByn(lineItem.totalBynRoundedRubles)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
                <DetailItem label="USD total" value={formatUsd(lead.totalUsdCents)} />
                <DetailItem label="BYN cents" value={`${numberFormatter.format(lead.totalBynCents / 100)} Br`} />
                <DetailItem label="BYN total" value={formatByn(lead.totalBynRoundedRubles)} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Selected service snapshot</CardTitle>
              <CardDescription>
                Stored from the original calculation, independent from current service prices.
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
              <CardTitle>CRM status</CardTitle>
              <CardDescription>
                Last status change {formatDateTime(lead.statusUpdatedAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Field>
                <FieldLabel>Status</FieldLabel>
                <LeadStatusSelect
                  value={lead.status}
                  label="Lead status"
                  disabled={updateLead.isPending}
                  onChange={(status) => void changeStatus(status)}
                />
              </Field>
              <DetailItem label="statusUpdatedAt" value={formatDateTime(lead.statusUpdatedAt)} />
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Notes</CardTitle>
              <CardDescription>Internal admin comment.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={(event) => void saveNotes(event)}>
                <Field>
                  <FieldLabel htmlFor="lead-notes">Notes</FieldLabel>
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
                  Save notes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Original proposal</CardTitle>
              <CardDescription>Offer artifacts are opened by their saved public token.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {lead.proposalArtifacts.length === 0 ? (
                <Typography tone="muted">No proposal artifact stored.</Typography>
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
                          {artifact.pdfUrlPath || artifact.pdfUrl ? 'Open original PDF' : 'Open proposal'}
                        </Typography>
                      </a>
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  )
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
    <FieldGroup className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto] md:items-end">
      <Field>
        <FieldLabel htmlFor="lead-search">Search</FieldLabel>
        <Input
          id="lead-search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Name or phone"
        />
      </Field>
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onChange({
              ...filters,
              status: value === 'all' ? 'all' : calculationStatus(value),
            })
          }
        >
          <SelectTrigger aria-label="Status filter" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {statusLabels[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel htmlFor="lead-name">Name</FieldLabel>
        <Input
          id="lead-name"
          value={filters.name}
          onChange={(event) => onChange({ ...filters, name: event.target.value })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="lead-phone">Phone</FieldLabel>
        <Input
          id="lead-phone"
          value={filters.phone}
          onChange={(event) => onChange({ ...filters, phone: event.target.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field>
          <FieldLabel htmlFor="lead-created-from">From</FieldLabel>
          <Input
            id="lead-created-from"
            type="date"
            value={filters.createdFrom}
            onChange={(event) => onChange({ ...filters, createdFrom: event.target.value })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="lead-created-to">To</FieldLabel>
          <Input
            id="lead-created-to"
            type="date"
            value={filters.createdTo}
            onChange={(event) => onChange({ ...filters, createdTo: event.target.value })}
          />
        </Field>
      </div>
      <Button type="button" variant="outline" onClick={onClear}>
        Clear
      </Button>
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
      <SelectTrigger aria-label={label} className="w-[150px]">
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
        <CardTitle>{numberFormatter.format(value)}</CardTitle>
      </CardHeader>
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
  if (!artifact) return <Typography tone="muted">No artifact</Typography>
  const label = preferredLabel ?? proposalButtonLabel(artifact)

  return (
    <Button asChild type="button" variant="ghost" size="sm">
      <a
        href={proposalHref(artifact)}
        target="_blank"
        rel="noreferrer"
        aria-label={`${label} for ${lead.clientName}`}
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
  if (services.length === 0) return 'No services'
  const visible = services.slice(0, 2).map((service) => service.title).join(', ')
  return services.length > 2 ? `${visible} +${services.length - 2}` : visible
}

function proposalHref(artifact: CalculationRecord['proposalArtifacts'][number]) {
  if (artifact.pdfUrlPath) return buildApiUrl(artifact.pdfUrlPath)
  if (artifact.pdfUrl) return artifact.pdfUrl
  return buildApiUrl(artifact.urlPath)
}

function proposalButtonLabel(artifact: CalculationRecord['proposalArtifacts'][number]) {
  return hasPdfArtifact(artifact) ? 'PDF' : 'Proposal'
}

function hasPdfArtifact(artifact: CalculationRecord['proposalArtifacts'][number] | undefined) {
  return Boolean(artifact?.pdfUrlPath || artifact?.pdfUrl)
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
  return `${numberFormatter.format(rubles)} Br`
}

function formatUsd(cents: number) {
  const value = cents / 100
  const formatted = value % 1 === 0
    ? numberFormatter.format(value)
    : new Intl.NumberFormat('ru-RU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)

  return `~${formatted} $`
}

function linePricingLabel(lineItem: CalculationLineItem) {
  if (lineItem.quantity.kind === 'fixed') return 'Fixed'
  return `${lineItem.quantity.areaSqm} m2 x ${formatUsd(lineItem.unitPriceUsdCents)}`
}

function pricingTypeLabel(pricingType: CalculationRecord['serviceSnapshots'][number]['pricingType']) {
  if (pricingType === 'fixed') return 'Fixed'
  if (pricingType === 'per_sqm') return 'Per m2'
  return 'Formula'
}

function errorMessage(error: unknown) {
  if (error instanceof ApiRequestError) return error.message
  if (error instanceof Error) return error.message
  return 'Unexpected error'
}
