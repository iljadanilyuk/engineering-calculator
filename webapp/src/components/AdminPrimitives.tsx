import type { PropsWithChildren, ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import type { Tone } from '@/lib/admin-derived'
import { cn } from '@/lib/utils'

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
}) {
  return (
    <div className="admin-page-head">
      <div className="admin-page-title">
        <Typography className="admin-eyebrow" variant="caption">{eyebrow}</Typography>
        <Typography className="admin-h1" variant="h1">{title}</Typography>
        <Typography className="admin-lead" variant="bodySm" tone="muted">{description}</Typography>
      </div>
      {actions && <PassthroughSlot className="admin-page-actions">{actions}</PassthroughSlot>}
    </div>
  )
}

export function AdminPanel({
  title,
  description,
  action,
  children,
  className,
}: PropsWithChildren<{
  title: string
  description?: string
  action?: ReactNode
  className?: string
}>) {
  return (
    <section className={cn('admin-panel', className)} aria-label={title}>
      <div className="admin-panel-head">
        <div className="admin-panel-title">
          <Typography variant="h6">{title}</Typography>
          {description && <Typography variant="caption" tone="muted">{description}</Typography>}
        </div>
        {action && <PassthroughSlot className="admin-panel-action">{action}</PassthroughSlot>}
      </div>
      <div className="admin-panel-body">
        {children}
      </div>
    </section>
  )
}

export function StatusPill({
  tone = 'gray',
  children,
  className,
}: PropsWithChildren<{
  tone?: Tone
  className?: string
}>) {
  return (
    <span className={cn('admin-status-pill', `tone-${tone}`, className)}>
      <Typography as="span" variant="controlXs">{children}</Typography>
    </span>
  )
}

export function MetricTile({
  label,
  value,
  tone = 'blue',
  caption,
}: {
  label: string
  value: string | number
  tone?: Tone
  caption?: string
}) {
  return (
    <div className={cn('admin-metric-tile', `tone-${tone}`)}>
      <Typography variant="caption" tone="muted">{label}</Typography>
      <Typography className="admin-metric-value numeric" variant="h4">{String(value)}</Typography>
      {caption && <Typography variant="caption" tone="muted">{caption}</Typography>}
    </div>
  )
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="admin-loading-block">
      <Spinner />
      <Typography variant="bodySm" tone="muted">{label}</Typography>
    </div>
  )
}

export function ErrorBlock({
  title,
  description,
  onRetry,
}: {
  title: string
  description: string
  onRetry?: () => void
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry && (
        <Button className="admin-alert-action" type="button" variant="outline" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </Alert>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="admin-empty-state">
      <Typography variant="h6">{title}</Typography>
      <Typography variant="bodySm" tone="muted">{description}</Typography>
      {action && <PassthroughSlot className="admin-empty-action">{action}</PassthroughSlot>}
    </div>
  )
}

function PassthroughSlot({
  children,
  className,
}: PropsWithChildren<{
  className: string
}>) {
  return <div className={className}>{children}</div>
}
