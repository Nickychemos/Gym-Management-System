/// <reference types="cypress" />

// Credentials come from cypress.env.json (gitignored) so no secrets land in
// the repo. Falls back to the demo admin if nothing is configured.
const DEFAULT_USR = (Cypress.env('usr') as string) ?? 'admin@example.com'
const DEFAULT_PWD = (Cypress.env('pwd') as string) ?? 'admin'

/**
 * Log in programmatically by hitting the same endpoint the app uses, then cache
 * the resulting session cookie with cy.session so every later test reuses it
 * instead of re-authenticating. This is the Cypress equivalent of siphy's
 * `authenticated_page` fixture.
 *
 * In dev, Frappe's CSRF check is bypassed, so the session cookie alone is enough
 * to drive the UI (including writes) after this runs.
 *
 * We hit Frappe's native /api/method/login (not the app's login_with_captcha
 * wrapper) so the programmatic login isn't blocked by reCAPTCHA — captcha is a
 * frontend-only gate; the session cookie this sets is identical.
 */
Cypress.Commands.add('login', (usr = DEFAULT_USR, pwd = DEFAULT_PWD) => {
  cy.session(
    ['gym', usr],
    () => {
      cy.request({
        method: 'POST',
        url: '/api/method/login',
        body: { usr, pwd },
      })
        .its('status')
        .should('eq', 200)
    },
    {
      // Confirm the cached session is still valid before reusing it.
      validate() {
        cy.request('/api/method/frappe.auth.get_logged_user')
          .its('status')
          .should('eq', 200)
      },
    },
  )
})

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      /** Log in (cached) and reuse the session across tests. */
      login(usr?: string, pwd?: string): Chainable<void>
    }
  }
}

export {}
