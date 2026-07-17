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
          <nav className="ml-auto flex items-center gap-2" aria-label="Основная навигация">
            <Typography asChild variant="control" tone="muted">
              <Link to="/" className={navLinkClass}>
                Вход
              </Link>
            </Typography>
            <Typography asChild variant="control" tone="muted">
              <Link to="/app" className={navLinkClass}>
                Админка
              </Link>
            </Typography>
          </nav>
          {auth.isAuthenticated && (
            <Button type="button" variant="outline" size="sm" onClick={() => void auth.logout()}>
              Выйти
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
          Админ-панель
        </Badge>
        <Typography className="max-w-3xl" variant="h1">
          Вход в управление калькулятором
        </Typography>
        <Typography className="max-w-2xl" tone="muted">
          Рабочий кабинет для заявок, услуг, цен и сохраненных КП/PDF.
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
        Нет доступа
      </Badge>
      <div className="grid max-w-3xl gap-4">
        <Typography variant="h1">Нужны права администратора</Typography>
        <Typography className="max-w-2xl" tone="muted">
          Эта учетная запись вошла в систему, но у нее нет доступа к админ-панели.
        </Typography>
      </div>
      <Button type="button" size="lg" className="w-fit" onClick={() => void auth.logout()}>
        Выйти
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
    ? 'Услуги и цены'
    : section === 'leads' ? 'Заявки' : 'Карточка заявки'

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-3">
          <Badge variant="outline" className="w-fit">
            Управление калькулятором
          </Badge>
          <Typography variant="h1">{title}</Typography>
          <Typography tone="muted">
            Вы вошли как {user.displayName ?? user.email} · {user.email}
          </Typography>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Разделы админки">
          <Button asChild type="button" variant={section === 'services' ? 'default' : 'outline'} size="sm">
            <Link to="/app/services">Услуги и цены</Link>
          </Button>
          <Button asChild type="button" variant={section !== 'services' ? 'default' : 'outline'} size="sm">
            <Link to="/app/leads">Заявки</Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled>
            Проекты/ТЗ
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled>
            Договоры
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
            Проверяем сессию...
          </Typography>
        </CardContent>
      </Card>
    </section>
  )
}
