/**
 * reCAPTCHA v3 helper. The site key comes from the backend (auth_config), so the
 * script only loads when reCAPTCHA is actually configured. Everything is a no-op
 * without a key, which keeps local dev and unconfigured sites working.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, opts: { action: string }) => Promise<string>
    }
  }
}

let siteKey: string | null = null
let loadPromise: Promise<void> | null = null

/** Load the v3 script once for the given site key. No-op without a key. */
export function initRecaptcha(key: string | null | undefined): void {
  if (!key || loadPromise) return
  siteKey = key
  loadPromise = new Promise<void>((resolve) => {
    const s = document.createElement('script')
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    // Fail open: if the script can't load, login still proceeds (the backend
    // skips verification when it gets no token, or fails open on its own error).
    s.onerror = () => resolve()
    document.head.appendChild(s)
  })
}

/** Whether reCAPTCHA is active (a site key was provided). */
export function recaptchaEnabled(): boolean {
  return siteKey !== null
}

/** Get a v3 token for an action, or null if reCAPTCHA isn't configured/ready. */
export async function getRecaptchaToken(
  action: string,
): Promise<string | null> {
  if (!siteKey || !loadPromise) return null
  await loadPromise
  const g = window.grecaptcha
  if (!g) return null
  return new Promise<string | null>((resolve) => {
    g.ready(() => {
      g.execute(siteKey as string, { action })
        .then(resolve)
        .catch(() => resolve(null))
    })
  })
}
