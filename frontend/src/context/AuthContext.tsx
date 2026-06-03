import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { authApi } from '@/lib/api'

interface Identity {
  user: string
  fullName: string
  roles: string[]
  isAdmin: boolean
}

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | ({ status: 'authenticated' } & Identity)

interface AuthContextValue {
  state: AuthState
  login: (usr: string, pwd: string) => Promise<void>
  logout: () => Promise<void>
  /** Re-read identity + roles (e.g. after accept-invite logs the user in). */
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function toState(id: Identity): AuthState {
  if (!id.user || id.user === 'Guest') return { status: 'unauthenticated' }
  return { status: 'authenticated', ...id }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  const hydrate = useCallback(async () => {
    try {
      const id = await authApi.currentUser()
      setState(toState(id))
    } catch {
      setState({ status: 'unauthenticated' })
    }
  }, [])

  // On boot: ask Frappe who we are (identity + roles).
  useEffect(() => {
    // hydrate() only setState()s after an awaited fetch (async, not sync), so
    // this doesn't cascade renders — the lint rule can't see across the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void hydrate()
  }, [hydrate])

  const login = async (usr: string, pwd: string) => {
    await authApi.login(usr, pwd)
    // login response lacks roles — hydrate identity right after.
    await hydrate()
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      setState({ status: 'unauthenticated' })
    }
  }

  return (
    <AuthContext.Provider value={{ state, login, logout, refresh: hydrate }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook colocated with its provider
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
