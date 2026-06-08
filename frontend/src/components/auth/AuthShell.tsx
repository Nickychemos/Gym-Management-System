import type { ReactNode } from 'react'

import heroImg from '@/assets/auth-hero.jpg'

interface AuthShellProps {
  children: ReactNode
  /** Small print under the form (support note or back link). */
  footer?: ReactNode
  /** Hero headline on the photo side. */
  heroTitle?: ReactNode
  /** One supporting line under the hero headline. */
  heroSubtitle?: string
}

/**
 * Split-screen auth layout: form on the left (white), full-bleed training
 * photo on the right under a soft dark gradient that keeps the image natural
 * while the headline stays readable. Below `lg` the photo drops away and the
 * form takes the full width. Shared by the sign-in and invite screens so the
 * whole way in looks the same.
 */
export function AuthShell({
  children,
  footer,
  heroTitle = 'Run a tighter gym.',
  heroSubtitle = 'Keep members, classes and payments moving from one place.',
}: AuthShellProps) {
  return (
    <div className="min-h-screen w-full bg-white lg:grid lg:grid-cols-[1fr_1.1fr]">
      {/* Left: form */}
      <div className="flex min-h-screen flex-col px-6 py-10 sm:px-10 lg:px-16">
        <Brand />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        {footer ? (
          <div className="text-center text-small text-neutral-500 lg:text-left">
            {footer}
          </div>
        ) : null}
      </div>

      {/* Right: hero */}
      <div className="relative hidden overflow-hidden bg-neutral-900 lg:block">
        <img
          src={heroImg}
          alt="Athlete resting between sets in the gym"
          className="absolute inset-0 h-full w-full object-cover grayscale"
        />
        {/* Dark gradient, heaviest at the bottom where the text sits, keeps the
            monochrome photo on-theme and the headline readable. */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-neutral-900/55 to-neutral-900/20" />
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-16">
          <div className="mb-6 h-1 w-12 rounded-full bg-accent-500" />
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-white xl:text-4xl">
            {heroTitle}
          </h2>
          <p className="mt-4 max-w-md text-body leading-relaxed text-white/70">
            {heroSubtitle}
          </p>
        </div>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="inline-flex items-center gap-2.5">
      <div className="grid size-9 place-items-center rounded-lg bg-neutral-900">
        <DumbbellIcon />
      </div>
      <span className="text-h3 font-semibold tracking-tight text-neutral-900">
        Benisho
      </span>
    </div>
  )
}

function DumbbellIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent-500)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </svg>
  )
}
