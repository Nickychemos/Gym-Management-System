import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { authApi } from '@/lib/api'

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; user: string }

interface AuthContextValue {
  state: AuthState
  login: (usr: string, pwd: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  // On boot: ask Frappe who we are. If 403/401 → unauthenticated.
  useEffect(() => {
    let cancelled = false
    authApi
      .getCurrentUser()
      .then((res) => {
        if (cancelled) return
        // Frappe returns 'Guest' for unauthenticated sessions
        if (!res.message || res.message === 'Guest') {
          setState({ status: 'unauthenticated' })
        } else {
          setState({ status: 'authenticated', user: res.message })
        }
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unauthenticated' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = async (usr: string, pwd: string) => {
    await authApi.login(usr, pwd)
    setState({ status: 'authenticated', user: usr })
  }

  const logout = async () => {
    try {
      await authApi.logout()
    } finally {
      setState({ status: 'unauthenticated' })
    }
  }

  return (
    <AuthContext.Provider value={{ state, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
