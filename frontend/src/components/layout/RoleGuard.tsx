import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/context/AuthContext'
import { canAccess } from '@/lib/roles'

/**
 * Redirects an authenticated user away from a route their role can't access
 * (back to the dashboard). Sits inside ProtectedRoute, which already handles
 * the loading + unauthenticated cases.
 */
export function RoleGuard({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const location = useLocation()

  if (state.status === 'authenticated') {
    const ok = canAccess(location.pathname, state.roles, state.isAdmin)
    if (!ok) return <Navigate to="/" replace />
  }
  return <>{children}</>
}
