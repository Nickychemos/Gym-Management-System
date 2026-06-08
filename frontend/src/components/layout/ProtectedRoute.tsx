import { Navigate } from 'react-router-dom'

import { useAuth } from '@/context/AuthContext'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useAuth()

  if (state.status === 'loading') {
    return (
      <div className="min-h-screen grid place-items-center bg-neutral-50">
        <div className="size-6 border-2 border-neutral-200 border-t-neutral-900 rounded-full animate-spin" />
      </div>
    )
  }

  if (state.status === 'unauthenticated') {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
