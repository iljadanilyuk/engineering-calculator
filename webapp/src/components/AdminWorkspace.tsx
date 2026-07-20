import {
  Agreement01Icon,
  Alert02Icon,
  DashboardSquare01Icon,
  Logout03Icon,
  Menu02Icon,
  SearchIcon,
  Settings01Icon,
  Task01Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { type PropsWithChildren, useState } from 'react'

import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Typography } from '@/components/ui/typography'
import { useAuth } from '@/lib/use-auth'
import { cn } from '@/lib/utils'

type HugeIcon = Parameters<typeof HugeiconsIcon>[0]['icon']

export type AdminWorkspaceSection =
  | 'dashboard'
  | 'projects'
  | 'tasks'
  | 'services'
  | 'project_cases'
  | 'blog_posts'
  | 'record'

type NavItem = {
  label: string
  href?: string
  icon: HugeIcon
  section?: AdminWorkspaceSection
  badge?: string
  disabled?: boolean
}

const workNav: NavItem[] = [
  {
    label: 'Рабочий стол',
    href: '/app',
    icon: DashboardSquare01Icon,
    section: 'dashboard',
  },
  {
    label: 'Заявки и проекты',
    href: '/app/leads',
    icon: WorkflowSquare01Icon,
    section: 'projects',
  },
  {
    label: 'Задачи',
    href: '/app/tasks',
    icon: Task01Icon,
    section: 'tasks',
  },
]

const controlNav: NavItem[] = [
  {
    label: 'Технические задания',
    icon: Agreement01Icon,
    disabled: true,
  },
  {
    label: 'Договоры',
    icon: Agreement01Icon,
    disabled: true,
  },
]

const productNav: NavItem[] = [
  {
    label: 'Услуги и цены',
    href: '/app/services',
    icon: Settings01Icon,
    section: 'services',
  },
  {
    label: 'Кейсы проектов',
    href: '/app/project-cases',
    icon: Agreement01Icon,
    section: 'project_cases',
  },
  {
    label: 'Блог',
    href: '/app/blog',
    icon: Agreement01Icon,
    section: 'blog_posts',
  },
  {
    label: 'Конструктор опросника',
    icon: Task01Icon,
    disabled: true,
  },
]

const systemNav: NavItem[] = [
  {
    label: 'Интеграции',
    icon: Alert02Icon,
    disabled: true,
  },
  {
    label: 'Настройки',
    icon: Settings01Icon,
    disabled: true,
  },
]

export function AdminWorkspace({
  section,
  children,
}: PropsWithChildren<{
  section: AdminWorkspaceSection
}>) {
  const auth = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const user = auth.user
  const displayName = user?.displayName ?? user?.email ?? 'Администратор'

  function closeMobileNav() {
    setMobileOpen(false)
  }

  return (
    <div className="admin-workspace-shell">
      <aside className={cn('admin-sidebar', mobileOpen && 'is-open')} aria-label="Разделы админ-панели">
        <div className="admin-brand">
          <BrandMark />
          <div className="admin-brand-copy">
            <Typography variant="bodySmMedium">ИП Позняк</Typography>
            <Typography variant="caption">Инженерные системы</Typography>
          </div>
        </div>

        <SidebarGroup
          label="Работа"
          items={workNav}
          activeSection={section}
          onNavigate={closeMobileNav}
        />
        <SidebarGroup
          label="Контроль"
          items={controlNav}
          activeSection={section}
          onNavigate={closeMobileNav}
        />
        <SidebarGroup
          label="Настройка продукта"
          items={productNav}
          activeSection={section}
          onNavigate={closeMobileNav}
        />
        <SidebarGroup
          label="Система"
          items={systemNav}
          activeSection={section}
          onNavigate={closeMobileNav}
        />

        <div className="admin-sidebar-footer">
          <div className="admin-profile">
            <div className="admin-avatar">
              <Typography variant="controlXs">{initials(displayName)}</Typography>
            </div>
            <div className="admin-profile-copy">
              <Typography variant="bodySmMedium" truncate>{displayName}</Typography>
              <Typography variant="caption" truncate>{user?.email ?? 'admin'}</Typography>
            </div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          className="admin-sidebar-backdrop"
          type="button"
          aria-label="Закрыть меню"
          onClick={closeMobileNav}
        />
      )}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <Button
              type="button"
              className="admin-mobile-menu"
              variant="outline"
              size="icon-sm"
              aria-label="Открыть меню"
              onClick={() => setMobileOpen(true)}
            >
              <HugeiconsIcon icon={Menu02Icon} strokeWidth={2} />
            </Button>
            <div className="admin-search">
              <HugeiconsIcon icon={SearchIcon} strokeWidth={2} aria-hidden="true" />
              <Input aria-label="Глобальный поиск" placeholder="Поиск по клиенту, телефону или проекту" />
            </div>
          </div>
          <div className="admin-topbar-actions">
            <Button type="button" variant="outline" size="sm" onClick={() => void auth.logout()}>
              <HugeiconsIcon icon={Logout03Icon} strokeWidth={2} data-icon="inline-start" />
              <Typography as="span" variant="control">Выйти</Typography>
            </Button>
          </div>
        </header>
        <main className="admin-content">
          {children}
        </main>
      </div>
    </div>
  )
}

function SidebarGroup({
  label,
  items,
  activeSection,
  onNavigate,
}: {
  label: string
  items: NavItem[]
  activeSection: AdminWorkspaceSection
  onNavigate: () => void
}) {
  return (
    <nav className="admin-nav-group" aria-label={label}>
      <Typography className="admin-nav-label" variant="caption">
        {label}
      </Typography>
      <div className="admin-nav-list">
        {items.map((item) => (
          <SidebarItem
            key={item.label}
            item={item}
            active={item.section === activeSection || (activeSection === 'record' && item.section === 'projects')}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </nav>
  )
}

function SidebarItem({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate: () => void
}) {
  if (item.disabled || !item.href) {
    return (
      <button className="admin-nav-item is-disabled" type="button" disabled>
        <SidebarItemContent item={item} />
      </button>
    )
  }

  return (
    <Link
      className={cn('admin-nav-item', active && 'is-active')}
      to={item.href}
      onClick={onNavigate}
    >
      <SidebarItemContent item={item} />
    </Link>
  )
}

function SidebarItemContent({ item }: { item: NavItem }) {
  return (
    <>
      <HugeiconsIcon icon={item.icon} strokeWidth={2} aria-hidden="true" />
      <Typography as="span" variant="control" truncate>{item.label}</Typography>
      {item.badge && (
        <span className="admin-nav-badge">
          <Typography variant="controlXs">{item.badge}</Typography>
        </span>
      )}
    </>
  )
}

function initials(value: string) {
  return value
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'АД'
}
