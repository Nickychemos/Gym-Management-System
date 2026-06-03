import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import { ApiError, authApi } from '@/lib/api'

function strength(pwd: string): { score: 0 | 1 | 2 | 3; label: string } {
  let s = 0
  if (pwd.length >= 8) s++
  if (/[0-9]/.test(pwd) && /[a-zA-Z]/.test(pwd)) s++
  if (/[^a-zA-Z0-9]/.test(pwd)) s++
  const label = ['Too short', 'Weak', 'Good', 'Strong'][s]
  return { score: s as 0 | 1 | 2 | 3, label }
}

export default function AcceptInvitePage() {
  const [params] = useSearchParams()
  const key = params.get('key')
  const navigate = useNavigate()
  const { refresh } = useAuth()

  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  const meter = strength(pwd)
  const canSubmit = pwd.length >= 8 && pwd === confirm && !submitting

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!key || !canSubmit) return
    setError(null)
    setSubmitting(true)
    try {
      await authApi.updatePassword(key, pwd)
      // update_password set the session server-side — pick up the new identity.
      await refresh()
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 410 || err.status === 417)) {
        setExpired(true)
      } else {
        setError(
          err instanceof Error ? err.message : 'Could not set your password.',
        )
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-2">
            <div className="size-8 rounded-md bg-brand-500" />
            <span className="text-h2 font-semibold tracking-tight text-neutral-900">
              Gym Management
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white shadow-[var(--shadow-card)] p-6">
          {!key ? (
            <Invalid title="Invalid invite link" body="This link is missing its token. Ask your administrator to resend the invite." />
          ) : expired ? (
            <Invalid title="Invite expired" body="This invite link has already been used or has expired. Ask your administrator to resend it." />
          ) : (
            <>
              <h1 className="text-h3 font-semibold mb-1">Set your password</h1>
              <p className="text-small text-neutral-600 mb-6">
                Choose a password to activate your account.
              </p>

              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-4">
                  <Label htmlFor="pwd">New password</Label>
                  <Input
                    id="pwd"
                    type="password"
                    autoComplete="new-password"
                    autoFocus
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                  />
                  {pwd && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1 flex-1 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                          className={[
                            'h-full transition-all',
                            meter.score >= 3
                              ? 'bg-success-500 w-full'
                              : meter.score === 2
                                ? 'bg-warning-500 w-2/3'
                                : 'bg-danger-500 w-1/3',
                          ].join(' ')}
                        />
                      </div>
                      <span className="text-tiny text-neutral-500">{meter.label}</span>
                    </div>
                  )}
                </div>

                <div className="mb-4">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    aria-invalid={!!confirm && confirm !== pwd}
                  />
                  {confirm && confirm !== pwd && (
                    <p className="mt-1 text-tiny text-danger-700">Passwords don't match.</p>
                  )}
                </div>

                {error && (
                  <div role="alert" className="mb-4 rounded-md bg-danger-50 px-3 py-2 text-small text-danger-700">
                    {error}
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
                  {submitting ? 'Setting password…' : 'Set password & sign in'}
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-small text-neutral-500">
          <Link to="/login" className="text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

function Invalid({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-4">
      <h1 className="text-h3 font-semibold mb-2">{title}</h1>
      <p className="text-small text-neutral-600">{body}</p>
    </div>
  )
}
