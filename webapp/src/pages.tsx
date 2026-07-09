import { Link, Outlet } from '@tanstack/react-router'

import { AuthForm } from '@/components/AuthForm'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
  return <AdminEntry />
}

function AdminEntry() {
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

  return <AdminShell />
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

function AdminShell() {
  const auth = useAuth()
  const user = auth.user

  if (!user) return null

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-12">
      <div className="grid gap-3">
        <Badge variant="outline" className="w-fit">
          Admin shell
        </Badge>
        <Typography variant="h1">
          {user.displayName ?? user.email}
        </Typography>
        <Typography tone="muted">{user.email}</Typography>
      </div>

      <Separator />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>Pricing and visibility controls are next.</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Leads</CardTitle>
            <CardDescription>Submitted calculations will appear here.</CardDescription>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Exchange rate and contact settings.</CardDescription>
          </CardHeader>
        </Card>
      </div>
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
