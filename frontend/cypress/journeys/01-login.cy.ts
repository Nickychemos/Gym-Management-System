import { LoginPage } from '../pages/LoginPage'

// First journey: prove the real login form works end to end. Later journeys
// skip the form and use the cached cy.login() command for speed.
describe('01 - Login', () => {
  it('signs in through the form and lands in the app', function () {
    // reCAPTCHA's whole purpose is to block automated browsers, so a real-form
    // submit can't pass when it's enabled. Skip (don't fail) in that case; this
    // test runs for real on a site with reCAPTCHA disabled (e.g. CI/test).
    cy.request('/api/method/gym_management.users.auth_config').then((res) => {
      const siteKey = res.body?.message?.recaptcha_site_key
      if (siteKey) {
        cy.log('reCAPTCHA enabled — skipping the real-form login (bot check blocks automation by design).')
        this.skip()
      }
    })

    LoginPage.visit()
    LoginPage.signIn(
      (Cypress.env('usr') as string) ?? 'admin@example.com',
      (Cypress.env('pwd') as string) ?? 'admin',
    )

    // On success the app redirects to the dashboard at the /gym root.
    cy.location('pathname', { timeout: 12000 }).should('eq', '/gym/')
    cy.contains('a', 'Members').should('be.visible')
  })

  it('rejects wrong credentials with an inline error', () => {
    LoginPage.visit()
    LoginPage.signIn('admin@example.com', 'definitely-the-wrong-password')

    LoginPage.error().should('be.visible')
    cy.location('pathname').should('eq', '/gym/login')
  })
})
