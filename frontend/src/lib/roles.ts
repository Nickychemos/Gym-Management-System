/**
 * Role-based navigation access (soft, frontend gating).
 *
 * "Full access" roles see everything. Restricted roles see only the union of
 * their allow-lists. Settings is full-access-only regardless. This is the UI
 * mirror of the backend capability matrix in gym_management/rbac.py — the
 * backend `@requires(...)` guards are the real boundary; this just hides what a
 * role can't use. ⚠️ Keep the two in sync: if you change a role's reach here,
 * update the method tiers in rbac.py (and vice-versa).
 */

export type NavKey =
  | 'dashboard'
  | 'members'
  | 'schedule'
  | 'classes'
  | 'pt'
  | 'payments'
  | 'refunds'
  | 'reports'
  | 'equipment'
  | 'compliance'
  | 'marketing'
  | 'coaching'
  | 'surveys'
  | 'settings'

/** Roles that see the whole app (no filtering). */
const FULL_ACCESS_ROLES = [
  'System Manager',
  'Administrator',
  'Gym Owner',
  'Gym Manager',
]

/** Allow-lists for restricted roles. Anything not listed here = full access. */
const ROLE_NAV: Record<string, NavKey[]> = {
  Receptionist: [
    'dashboard',
    'members',
    'schedule',
    'classes',
    'pt',
    'payments',
    'refunds',
  ],
  Trainer: ['dashboard', 'schedule', 'classes', 'pt', 'coaching', 'members'],
}

/** Map each route path (from App/Sidebar) to its NavKey. */
export const ROUTE_KEY: Record<string, NavKey> = {
  '/': 'dashboard',
  '/members': 'members',
  '/schedule': 'schedule',
  '/classes': 'classes',
  '/pt': 'pt',
  '/payments': 'payments',
  '/refunds': 'refunds',
  '/reports': 'reports',
  '/equipment': 'equipment',
  '/compliance': 'compliance',
  '/marketing': 'marketing',
  '/coaching': 'coaching',
  '/surveys': 'surveys',
  '/settings': 'settings',
}

function hasFullAccess(roles: string[], isAdmin: boolean): boolean {
  return isAdmin || roles.some((r) => FULL_ACCESS_ROLES.includes(r))
}

/** Manager tier (owner/manager/admin) — mirrors rbac.MANAGER. Use to gate
 *  destructive or financial actions in the UI; the backend @requires(MANAGER)
 *  guard is the real boundary. */
export function isManager(roles: string[], isAdmin: boolean): boolean {
  return hasFullAccess(roles, isAdmin)
}

/** The NavKeys a user may access, or `null` meaning "everything". */
export function allowedKeys(
  roles: string[],
  isAdmin: boolean,
): Set<NavKey> | null {
  if (hasFullAccess(roles, isAdmin)) return null
  const keys = new Set<NavKey>()
  for (const role of roles) {
    for (const key of ROLE_NAV[role] ?? []) keys.add(key)
  }
  return keys
}

/** Whether a user may access a given route path. */
export function canAccess(
  path: string,
  roles: string[],
  isAdmin: boolean,
): boolean {
  // Settings is owner/manager-only.
  if (path.startsWith('/settings')) return hasFullAccess(roles, isAdmin)
  const allowed = allowedKeys(roles, isAdmin)
  if (allowed === null) return true
  // Match the most specific known route prefix (e.g. /members/:id → /members).
  const base = '/' + (path.split('/')[1] ?? '')
  const key = ROUTE_KEY[base] ?? ROUTE_KEY[path]
  return key ? allowed.has(key) : true
}
