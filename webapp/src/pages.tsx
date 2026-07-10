import { Link, Outlet, useParams } from '@tanstack/react-router'

import { AuthForm } from '@/components/AuthForm'
import { LeadDetailView, LeadsManager } from '@/components/LeadsManager'
import { ServicesManager } from '@/components/ServicesManager'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/use-auth'

const navLinkClass = cn(
  buttonVariants({ variant: 'ghost', size: 'sm' }),
  'text-muted-foreground data-[status=active]:bg-secondary data-[status=active]:text-secondary-foreground data-[status=active]:hover:bg-secondary/80 data-[status=active]:hover:text-secondary-foreground',
)

export function RootLayout() {
  const auth = useAuth()

  return (
    <main className="min-h-svh bg-background text-foreground">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 w-full max-w-6xl flex-wrap items-center gap-3 px-5 py-3">
          <Typography asChild variant="h6">
            <Link to="/">ИП Позняк</Link>
          </Typography>
          <nav className="ml-auto flex items-center gap-2" aria-label="Primary">
            <Typography asChild variant="control" tone="muted">
              <Link to="/" className={navLinkClass}>
                Login
              </Link>
            </Typography>
            <Typography asChild variant="control" tone="muted">
              <Link to="/app" className={navLinkClass}>
                Admin
              </Link>
            </Typography>
          </nav>
          {auth.isAuthenticated && (
            <Button type="button" variant="outline" size="sm" onClick={() => void auth.logout()}>
              Logout
            </Button>
          )}
        </div>
      </header>
      <Outlet />
    </main>
  )
}

export function HomePage() {
  return <AdminEntry />
}

export function AppPage() {
  return <AdminEntry section="services" />
}

export function ServicesPage() {
  return <AdminEntry section="services" />
}

export function LeadsPage() {
  return <AdminEntry section="leads" />
}

export function LeadDetailPage() {
  const params = useParams({ strict: false }) as { leadId?: string }

  return <AdminEntry section="lead-detail" leadId={params.leadId ?? ''} />
}

type AdminSection = 'services' | 'leads' | 'lead-detail'

function AdminEntry({
  section = 'services',
  leadId,
}: {
  section?: AdminSection
  leadId?: string
}) {
  const auth = useAuth()

  if (auth.isBootstrapping) {
    return <LoadingState />
  }

  if (!auth.user) {
    return <LoginScreen />
  }

  if (auth.user.role !== 'admin') {
    return <ForbiddenState />
  }

  return <AdminShell section={section} leadId={leadId} />
}

function LoginScreen() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
      <div className="grid gap-5">
        <Badge variant="outline" className="w-fit">
          Admin cabinet
        </Badge>
        <Typography className="max-w-3xl" variant="h1">
          Login for calculator administration.
        </Typography>
        <Typography className="max-w-2xl" tone="muted">
          Manage services, exchange-rate settings, submitted calculations, and proposal records.
        </Typography>
      </div>
      <AuthForm />
    </section>
  )
}

function ForbiddenState() {
  const auth = useAuth()

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-16">
      <Badge variant="outline" className="w-fit">
        Forbidden
      </Badge>
      <div className="grid max-w-3xl gap-4">
        <Typography variant="h1">Admin access required</Typography>
        <Typography className="max-w-2xl" tone="muted">
          The current account is signed in but is not allowed to use the admin cabinet.
        </Typography>
      </div>
      <Button type="button" size="lg" className="w-fit" onClick={() => void auth.logout()}>
        Logout
      </Button>
    </section>
  )
}

function AdminShell({
  section,
  leadId,
}: {
  section: AdminSection
  leadId?: string
}) {
  const auth = useAuth()
  const user = auth.user

  if (!user) return null

  const title = section === 'services'
    ? 'Services management'
    : section === 'leads' ? 'Leads Mini-CRM' : 'Lead detail'

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3">
          <Badge variant="outline" className="w-fit">
            Admin cabinet
          </Badge>
          <Typography variant="h1">{title}</Typography>
          <Typography tone="muted">
            Signed in as {user.displayName ?? user.email} · {user.email}
          </Typography>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Admin sections">
          <Button asChild type="button" variant={section === 'services' ? 'default' : 'outline'} size="sm">
            <Link to="/app/services">Services</Link>
          </Button>
          <Button asChild type="button" variant={section !== 'services' ? 'default' : 'outline'} size="sm">
            <Link to="/app/leads">Leads</Link>
          </Button>
        </nav>
      </div>

      <Separator />

      {section === 'services' && <ServicesManager />}
      {section === 'leads' && <LeadsManager />}
      {section === 'lead-detail' && leadId && <LeadDetailView leadId={leadId} />}
    </section>
  )
}

function LoadingState() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-16">
      <Card className="w-fit">
        <CardContent className="flex items-center gap-3">
          <Spinner />
          <Typography variant="bodySm" tone="muted">
            Checking session...
          </Typography>
        </CardContent>
      </Card>
    </section>
  )
}
