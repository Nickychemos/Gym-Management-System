import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function Layout() {
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)

  // Scroll back to the top on every route change. The scrollable area is
  // <main> (not the window), so a normal window.scrollTo wouldn't reset it,
  // which is why navigating from a long page left the next page scrolled down.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, left: 0 })
  }, [pathname])

  return (
    <div className="h-screen flex bg-neutral-50">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main ref={mainRef} className="flex-1 overflow-y-auto">
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
