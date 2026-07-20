import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import {
  AppPage,
  BlogPostsPage,
  HomePage,
  LeadDetailPage,
  LeadsPage,
  ProjectCasesPage,
  RootLayout,
  ServicesPage,
  TasksPage,
} from './pages'

const rootRoute = createRootRoute({
  component: RootLayout,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  component: AppPage,
})

const servicesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/services',
  component: ServicesPage,
})

const projectCasesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/project-cases',
  component: ProjectCasesPage,
})

const blogPostsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/blog',
  component: BlogPostsPage,
})

const leadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/leads',
  component: LeadsPage,
})

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/tasks',
  component: TasksPage,
})

const leadDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/leads/$leadId',
  component: LeadDetailPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  appRoute,
  servicesRoute,
  projectCasesRoute,
  blogPostsRoute,
  leadsRoute,
  tasksRoute,
  leadDetailRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
