/// <reference types="cypress" />

// Every top-level module page in the app (matches the sidebar + Settings/Profile).
// Used by the breadth "navigation" tour to assert each module loads cleanly.
export interface ModulePage {
  path: string
  label: string
}

export const MODULE_PAGES: ModulePage[] = [
  { path: '/gym/', label: 'Dashboard' },
  { path: '/gym/members', label: 'Members' },
  { path: '/gym/schedule', label: 'Schedule' },
  { path: '/gym/classes', label: 'Classes' },
  { path: '/gym/pt', label: 'PT Packages' },
  { path: '/gym/payments', label: 'Payments' },
  { path: '/gym/refunds', label: 'Refunds' },
  { path: '/gym/equipment', label: 'Equipment' },
  { path: '/gym/compliance', label: 'Compliance' },
  { path: '/gym/marketing', label: 'Marketing' },
  { path: '/gym/coaching', label: 'Coaching' },
  { path: '/gym/surveys', label: 'Surveys & NPS' },
  { path: '/gym/reports', label: 'Reports' },
  { path: '/gym/settings', label: 'Settings' },
  { path: '/gym/profile', label: 'Profile' },
]
