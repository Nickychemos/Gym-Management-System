/**
 * Typed Frappe API client.
 *
 * Talks to the Frappe site behind Vite's dev proxy (see vite.config.ts).
 * Cookies flow automatically via `credentials: 'include'`, so once the
 * /api/method/login call succeeds the session cookie carries every
 * subsequent request.
 *
 * Three call shapes:
 *   - api.getDoc('Member Profile', name)        — single document
 *   - api.getList('Member Profile', {filters})  — list with filters
 *   - api.callMethod('gym_management.x.y', ...) — whitelisted methods
 */

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// --- Centralized auth-error handling --------------------------------------
// A single place to react when the server says "you are not (or no longer)
// authenticated". AuthProvider registers a handler that flips auth state to
// unauthenticated, so an expired session anywhere redirects to /login instead
// of every page showing a cryptic error.

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  unauthorizedHandler = fn
}

/**
 * Distinguish "session expired / not logged in" from "logged in but forbidden".
 * A 401 is always an auth error. A 403 is only an auth error when Frappe signals
 * an authentication/session/CSRF failure — a plain PermissionError (e.g. our
 * @requires RBAC guard) is NOT, and must not log the user out.
 */
function isAuthError(status: number, body: unknown): boolean {
  if (status === 401) return true
  if (status !== 403) return false
  const b = body as { exc_type?: string; exception?: string } | null
  const signal = `${b?.exc_type ?? ''} ${b?.exception ?? ''}`
  return /AuthenticationError|SessionExpired|CSRFTokenError|InvalidAuthorizationToken/i.test(
    signal,
  )
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Frappe-CSRF-Token': getCsrfToken() ?? '',
      ...(init.headers ?? {}),
    },
    ...init,
  })

  let body: unknown
  try {
    body = await res.json()
  } catch {
    body = null
  }

  if (!res.ok) {
    // Surface session-expiry centrally — but never for the login call itself,
    // where a 401 just means "wrong credentials" and the form shows the error.
    const isLogin =
      path.includes('/api/method/login') || path.includes('login_with_captcha')
    if (!isLogin && isAuthError(res.status, body)) {
      unauthorizedHandler?.()
    }
    const message =
      (body as { message?: string; exception?: string } | null)?.message ??
      (body as { exception?: string } | null)?.exception ??
      `${res.status} ${res.statusText}`
    throw new ApiError(res.status, body, message)
  }
  return body as T
}

function getCsrfToken(): string | null {
  // Frappe sets csrf_token on window after login; before that we can omit.
  const w = window as unknown as { csrf_token?: string }
  return w.csrf_token ?? null
}

// ---------- Auth ----------

export interface FrappeUser {
  full_name: string
  email: string
  username: string
}

export const authApi = {
  /**
   * Sign in. Goes through our login_with_captcha wrapper so the reCAPTCHA token
   * (when enabled) is verified server-side before authenticating. Behaves like a
   * normal login when reCAPTCHA isn't configured. Sets the session cookie on success.
   */
  async login(
    usr: string,
    pwd: string,
    recaptchaToken?: string | null,
    remember = true,
  ) {
    return request<{ message: { message: string; full_name: string } }>(
      '/api/method/gym_management.users.login_with_captcha',
      {
        method: 'POST',
        body: JSON.stringify({
          usr,
          pwd,
          token: recaptchaToken ?? null,
          remember,
        }),
      },
    )
  },

  /** Public pre-login config (e.g. the reCAPTCHA site key). */
  async authConfig() {
    const res = await request<{
      message: { recaptcha_site_key: string | null }
    }>('/api/method/gym_management.users.auth_config')
    return res.message
  },

  /** POST /api/method/logout */
  async logout() {
    return request<unknown>('/api/method/logout', { method: 'POST' })
  },

  /** GET /api/method/frappe.auth.get_logged_user */
  async getCurrentUser() {
    return request<{ message: string }>(
      '/api/method/frappe.auth.get_logged_user',
    )
  },

  /** Identity + roles for the logged-in user (drives role-based gating). */
  async currentUser() {
    const res = await request<{
      message: {
        user: string
        full_name: string
        roles: string[]
        is_admin: boolean
      }
    }>('/api/method/gym_management.users.current_user')
    return res.message
  },

  /** Set a password from an invite/reset key — also logs the user in. */
  async updatePassword(key: string, new_password: string) {
    return request<{ message: string }>(
      '/api/method/frappe.core.doctype.user.user.update_password',
      { method: 'POST', body: JSON.stringify({ key, new_password }) },
    )
  },

  /** Trigger Frappe's self-serve password reset email (needs SMTP). */
  async forgotPassword(user: string) {
    return request<unknown>(
      '/api/method/frappe.core.doctype.user.user.reset_password',
      { method: 'POST', body: JSON.stringify({ user }) },
    )
  },
}

// ---------- Generic doc helpers (used as we build out pages) ----------

interface ListParams {
  fields?: string[]
  filters?: Record<string, unknown>
  order_by?: string
  limit_page_length?: number
  limit_start?: number
}

export const api = {
  async getDoc<T>(doctype: string, name: string): Promise<T> {
    const enc = encodeURIComponent(name)
    const res = await request<{ data: T }>(
      `/api/resource/${encodeURIComponent(doctype)}/${enc}`,
    )
    return res.data
  },

  async getList<T>(doctype: string, params: ListParams = {}): Promise<T[]> {
    const search = new URLSearchParams()
    if (params.fields) search.set('fields', JSON.stringify(params.fields))
    if (params.filters) search.set('filters', JSON.stringify(params.filters))
    if (params.order_by) search.set('order_by', params.order_by)
    // 0 is meaningful to Frappe ("return all rows"), so test for undefined.
    if (params.limit_page_length !== undefined)
      search.set('limit_page_length', String(params.limit_page_length))
    if (params.limit_start) search.set('limit_start', String(params.limit_start))
    const url = `/api/resource/${encodeURIComponent(doctype)}?${search.toString()}`
    const res = await request<{ data: T[] }>(url)
    return res.data
  },

  async callMethod<T>(
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await request<{ message: T }>(`/api/method/${method}`, {
      method: 'POST',
      body: JSON.stringify(args),
    })
    return res.message
  },

  /**
   * GET a read-only whitelisted method. Prefer this for queries: GET skips
   * Frappe's CSRF check (which matters in dev, where the SPA HTML isn't
   * Jinja-rendered so window.csrf_token is absent) and the response is
   * cacheable. Use callMethod (POST) for anything that mutates.
   */
  async callMethodGet<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue
      search.set(k, typeof v === 'string' ? v : JSON.stringify(v))
    }
    const qs = search.toString()
    const url = `/api/method/${method}${qs ? `?${qs}` : ''}`
    const res = await request<{ message: T }>(url)
    return res.message
  },
}
