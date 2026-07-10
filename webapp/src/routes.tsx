import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router'

import {
  AppPage,
  HomePage,
  LeadDetailPage,
  LeadsPage,
  RootLayout,
  ServicesPage,
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

const leadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/leads',
  component: LeadsPage,
})

const leadDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app/leads/$leadId',
  component: LeadDetailPage,
})

const routeTree = rootRoute.addChildren([indexRoute, appRoute, servicesRoute, leadsRoute, leadDetailRoute])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
