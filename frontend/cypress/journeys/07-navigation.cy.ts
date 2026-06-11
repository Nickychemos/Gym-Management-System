import { MODULE_PAGES } from '../pages/nav'

// Breadth tour: visit EVERY module page and assert it loads with its heading and
// no error state. This is the blanket guarantee that all modules are covered.
describe('07 - Navigation (all modules load)', () => {
  beforeEach(() => cy.login())

  MODULE_PAGES.forEach(({ path, label }) => {
    it(`loads ${label} (${path})`, () => {
      cy.visit(path)
      cy.location('pathname', { timeout: 12000 }).should('eq', path)
      // Every page renders a heading once loaded.
      cy.get('h1', { timeout: 12000 }).should('be.visible')
      // None should be showing a hard error / failed-load state.
      cy.get('body')
        .should('not.contain', "Couldn't load")
        .and('not.contain', 'Something went wrong')
    })
  })
})
