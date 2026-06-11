/// <reference types="cypress" />

// Page object for Payments + the STK Push (record payment) modal.
export const PaymentsPage = {
  visit: () => cy.visit('/gym/payments'),

  rows: () => cy.get('[data-testid="payment-row"]'),
  searchBox: () => cy.get('input[placeholder*="Search phone"]'),
  statusFilter: () => cy.get('select[aria-label="Status"]'),
  directionFilter: () => cy.get('select[aria-label="Direction"]'),

  openStkModal() {
    cy.get('[data-testid="payments-stk-trigger"]').click()
    cy.get('[role="dialog"]').should('be.visible')
  },

  pickMember(query: string) {
    cy.get('[data-testid="member-picker-search"]').type(query)
    cy.get('[data-testid="member-picker-result"]', { timeout: 10000 }).first().click()
  },

  /**
   * Record a payment via STK Push. M-Pesa may not be configured in dev, where
   * the backend records it and toasts "Recorded …" instead of "STK push sent".
   */
  recordPayment(memberQuery: string, amount: string) {
    PaymentsPage.openStkModal()
    PaymentsPage.pickMember(memberQuery)
    cy.get('#amt').clear().type(amount)
    cy.get('[data-testid="stk-submit"]').click()
    cy.contains(/STK push sent|Recorded/i, { timeout: 12000 }).should('be.visible')
  },
}
