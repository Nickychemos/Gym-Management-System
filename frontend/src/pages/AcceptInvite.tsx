import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { useAuth } from '@/context/AuthContext'
import { ApiError, authApi } from '@/lib/api'

// Matches the sign-in screen: ink-black primary, neutral focus ring.
const PRIMARY_BTN =
  'bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-900 focus-visible:ring-accent-500'
const FIELD = 'focus:border-neutral-400 focus:ring-neutral-900/10'

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
      // update_password set the session server-side, so pick up the new identity.
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

  const footer = (
    <Link
      to="/login"
      className="font-medium text-neutral-700 hover:text-neutral-900"
    >
      Back to sign in
    </Link>
  )

  return (
    <AuthShell
      footer={footer}
      heroTitle="Welcome to the team."
      heroSubtitle="One quick step and you are in: set your password below."
    >
      {!key ? (
        <Invalid
          title="Invalid invite link"
          body="This link is missing its token. Ask your administrator to resend the invite."
        />
      ) : expired ? (
        <Invalid
          title="Invite expired"
          body="This invite link has already been used or has expired. Ask your administrator to resend it."
        />
      ) : (
        <>
          <h1 className="text-h2 font-semibold tracking-tight">
            Set your password
          </h1>
          <p className="mt-1.5 text-body text-neutral-600">
            Pick a password to finish setting up your account.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8">
            <div className="mb-4">
              <Label htmlFor="pwd">New password</Label>
              <PasswordInput
                id="pwd"
                autoComplete="new-password"
                autoFocus
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className={FIELD}
              />
              {pwd && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={[
                        'h-full transition-all',
                        meter.score >= 3
                          ? 'w-full bg-success-500'
                          : meter.score === 2
                            ? 'w-2/3 bg-warning-500'
                            : 'w-1/3 bg-danger-500',
                      ].join(' ')}
                    />
                  </div>
                  <span className="text-tiny text-neutral-500">{meter.label}</span>
                </div>
              )}
            </div>

            <div className="mb-5">
              <Label htmlFor="confirm">Confirm password</Label>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                aria-invalid={!!confirm && confirm !== pwd}
                className={FIELD}
              />
              {confirm && confirm !== pwd && (
                <p className="mt-1 text-tiny text-danger-700">
                  Passwords do not match.
                </p>
              )}
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
              className={`w-full ${PRIMARY_BTN}`}
              disabled={!canSubmit}
            >
              {submitting ? 'Setting password' : 'Set password and sign in'}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

function Invalid({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-2">
      <h1 className="text-h2 font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-body text-neutral-600">{body}</p>
    </div>
  )
}
