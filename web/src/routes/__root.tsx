import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ErrorBoundary } from '../ErrorBoundary'
import '../app.css'

export const Route = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <Outlet />
    </ErrorBoundary>
  ),
})
