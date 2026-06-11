/// <reference types="cypress" />

// Page object: selectors + actions only, no assertions. If the login UI
// changes, this is the single file to update.
export const LoginPage = {
  visit: () => cy.visit('/gym/login'),

  usr: () => cy.get('#usr'),
  pwd: () => cy.get('#pwd'),
  submit: () => cy.get('button[type="submit"]'),
  error: () => cy.get('[role="alert"]'),

  signIn(usr: string, pwd: string) {
    LoginPage.usr().clear().type(usr)
    LoginPage.pwd().clear().type(pwd, { log: false })
    LoginPage.submit().click()
  },
}
