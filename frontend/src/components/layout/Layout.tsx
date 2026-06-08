import { Outlet, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="h-screen flex bg-neutral-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1440px] mx-auto px-8 py-6">
            {/* Per-page boundary: a single page crashing keeps the shell alive,
                and changing routes (resetKey) clears the error automatically. */}
            <ErrorBoundary resetKey={pathname}>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  )
}
