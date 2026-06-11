/// <reference types="cypress" />

// Page object for the Reports area. The viewer is URL-driven (?report=<key>),
// so we navigate straight to a report instead of clicking through the catalogue.
export const ReportsPage = {
  catalogue: () => cy.visit('/gym/reports'),

  openReport(key: string) {
    cy.visit(`/gym/reports?report=${key}`)
    // The "All reports" breadcrumb only exists in viewer mode -> confirms the
    // report actually opened (not the catalogue).
    cy.contains('All reports', { timeout: 12000 }).should('be.visible')
    cy.get('body').should('not.contain', "Couldn't load")
  },
}
