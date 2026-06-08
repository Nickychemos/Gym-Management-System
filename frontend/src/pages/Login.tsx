import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'

import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PasswordInput } from '@/components/ui/password-input'
import { useAuth } from '@/context/AuthContext'
import { authApi } from '@/lib/api'

// Auth screens use an ink-black primary and a neutral focus ring instead of the
// app's indigo. Kept local for now; this is the blueprint we roll out elsewhere.
const PRIMARY_BTN =
  'bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-900 focus-visible:ring-accent-500'
const FIELD = 'focus:border-neutral-400 focus:ring-neutral-900/10'

export default function LoginPage() {
  const { state, login } = useAuth()
  const [usr, setUsr] = useState('')
  const [pwd, setPwd] = useState('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Forgot-password sub-flow (inline panel).
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotBusy, setForgotBusy] = useState(false)

  if (state.status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  async function handleForgot(e: FormEvent) {
    e.preventDefault()
    setForgotBusy(true)
    try {
      await authApi.forgotPassword(forgotEmail)
    } catch {
      // Swallow: never reveal whether the account exists (anti-enumeration).
    } finally {
      setForgotBusy(false)
      setForgotSent(true)
    }
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
          : 'That email or password did not match. Try again.',
      )
      setSubmitting(false)
    }
  }

  return (
    <AuthShell footer={<>Trouble signing in? Contact your gym administrator.</>}>
      {forgotOpen ? (
        <ForgotPanel
          email={forgotEmail}
          setEmail={setForgotEmail}
          sent={forgotSent}
          busy={forgotBusy}
          onSubmit={handleForgot}
          onBack={() => {
            setForgotOpen(false)
            setForgotSent(false)
          }}
        />
      ) : (
        <>
          <h1 className="text-h2 font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1.5 text-body text-neutral-600">
            Sign in to your gym account.
          </p>

          <form onSubmit={handleSubmit} noValidate className="mt-8">
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
                className={FIELD}
              />
            </div>

            <div className="mb-4">
              <Label htmlFor="pwd">Password</Label>
              <PasswordInput
                id="pwd"
                autoComplete="current-password"
                required
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="mb-5 flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-small text-neutral-600">
                <Checkbox
                  className="accent-neutral-900"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Keep me signed in
              </label>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(usr)
                  setForgotOpen(true)
                }}
                className="text-small font-medium text-neutral-700 hover:text-neutral-900"
              >
                Forgot password?
              </button>
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
              disabled={submitting || !usr || !pwd}
            >
              {submitting && <Spinner />}
              {submitting ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

function Spinner() {
  return (
    <svg
      className="size-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4Z"
      />
    </svg>
  )
}

function ForgotPanel({
  email,
  setEmail,
  sent,
  busy,
  onSubmit,
  onBack,
}: {
  email: string
  setEmail: (v: string) => void
  sent: boolean
  busy: boolean
  onSubmit: (e: FormEvent) => void
  onBack: () => void
}) {
  if (sent) {
    return (
      <div className="py-2">
        <h1 className="text-h2 font-semibold tracking-tight">
          Check your email
        </h1>
        <p className="mt-1.5 mb-8 text-body text-neutral-600">
          If an account exists for that address, a link to reset your password
          is on its way.
        </p>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={onBack}
        >
          Back to sign in
        </Button>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-h2 font-semibold tracking-tight">Reset password</h1>
      <p className="mt-1.5 text-body text-neutral-600">
        Enter your email and we will send you a reset link.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-8">
        <div className="mb-5">
          <Label htmlFor="forgot-email">Email</Label>
          <Input
            id="forgot-email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className={`w-full ${PRIMARY_BTN}`}
          disabled={busy || !email}
        >
          {busy ? 'Sending' : 'Send reset link'}
        </Button>
      </form>
      <button
        type="button"
        onClick={onBack}
        className="mt-4 w-full text-center text-small font-medium text-neutral-700 hover:text-neutral-900"
      >
        Back to sign in
      </button>
    </>
  )
}
