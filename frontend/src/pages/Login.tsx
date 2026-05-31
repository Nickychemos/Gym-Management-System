import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'

export default function LoginPage() {
  const { state, login } = useAuth()
  const [usr, setUsr] = useState('')
  const [pwd, setPwd] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state.status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(usr, pwd)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Login failed — please check your credentials.',
      )
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo / wordmark */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="size-8 rounded-md bg-brand-500" />
            <span className="text-h2 font-semibold tracking-tight text-neutral-900">
              Gym Management
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white shadow-[var(--shadow-card)] p-6">
          <h1 className="text-h3 font-semibold mb-1">Sign in</h1>
          <p className="text-small text-neutral-600 mb-6">
            Use your gym admin credentials.
          </p>

          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <Label htmlFor="usr">Email or username</Label>
              <Input
                id="usr"
                type="text"
                autoComplete="username"
                autoFocus
                required
                value={usr}
                onChange={(e) => setUsr(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <Label htmlFor="pwd">Password</Label>
              <Input
                id="pwd"
                type="password"
                autoComplete="current-password"
                required
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-small text-danger-700"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || !usr || !pwd}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-small text-neutral-500">
          Trouble signing in? Contact your gym administrator.
        </p>
      </div>
    </div>
  )
}
