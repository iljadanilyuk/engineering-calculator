import { Outlet, useParams } from '@tanstack/react-router'

import { AdminDashboard } from '@/components/AdminDashboard'
import { AdminTasks } from '@/components/AdminTasks'
import { AdminWorkspace, type AdminWorkspaceSection } from '@/components/AdminWorkspace'
import { AuthForm } from '@/components/AuthForm'
import { LeadDetailView, LeadsManager } from '@/components/LeadsManager'
import { ServicesManager } from '@/components/ServicesManager'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Typography } from '@/components/ui/typography'
import { useAuth } from '@/lib/use-auth'

export function RootLayout() {
  return <Outlet />
}

export function HomePage() {
  return <AdminEntry section="dashboard" />
}

export function AppPage() {
  return <AdminEntry section="dashboard" />
}

export function ServicesPage() {
  return <AdminEntry section="services" />
}

export function LeadsPage() {
  return <AdminEntry section="projects" />
}

export function TasksPage() {
  return <AdminEntry section="tasks" />
}

export function LeadDetailPage() {
  const params = useParams({ strict: false }) as { leadId?: string }

  return <AdminEntry section="record" leadId={params.leadId ?? ''} />
}

function AdminEntry({
  section,
  leadId,
}: {
  section: AdminWorkspaceSection
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

  return (
    <AdminWorkspace section={section}>
      {section === 'dashboard' && <AdminDashboard />}
      {section === 'projects' && <LeadsManager />}
      {section === 'tasks' && <AdminTasks />}
      {section === 'services' && <ServicesManager />}
      {section === 'record' && leadId && <LeadDetailView leadId={leadId} />}
    </AdminWorkspace>
  )
}

function LoginScreen() {
  return (
    <main className="admin-login-screen">
      <section className="admin-login-layout" aria-labelledby="login-heading">
        <div className="admin-login-copy">
          <Typography className="admin-eyebrow" variant="caption">Админ-панель</Typography>
          <Typography id="login-heading" className="admin-h1" variant="h1">
            Вход в управление калькулятором
          </Typography>
          <Typography className="admin-lead" variant="bodySm" tone="muted">
            Рабочий кабинет для заявок, проектов, услуг, цен и сохраненных КП/PDF.
          </Typography>
        </div>
        <AuthForm />
      </section>
    </main>
  )
}

function ForbiddenState() {
  const auth = useAuth()

  return (
    <main className="admin-login-screen">
      <section className="admin-login-layout single" aria-labelledby="forbidden-heading">
        <div className="admin-login-copy">
          <Typography className="admin-eyebrow" variant="caption">Нет доступа</Typography>
          <Typography id="forbidden-heading" className="admin-h1" variant="h1">
            Нужны права администратора
          </Typography>
          <Typography className="admin-lead" variant="bodySm" tone="muted">
            Эта учетная запись вошла в систему, но у нее нет доступа к админ-панели.
          </Typography>
          <Button type="button" className="admin-fit" size="lg" onClick={() => void auth.logout()}>
            Выйти
          </Button>
        </div>
      </section>
    </main>
  )
}

function LoadingState() {
  return (
    <main className="admin-login-screen">
      <Card className="admin-loading-card">
        <CardContent className="admin-loading-card-content">
          <Spinner />
          <Typography variant="bodySm" tone="muted">Проверяем сессию...</Typography>
        </CardContent>
      </Card>
    </main>
  )
}
