/// <reference types="cypress" />

// Page object for the weekly Schedule + the class BookingModal.
export const SchedulePage = {
  visit: () => cy.visit('/gym/schedule'),

  sessions: () => cy.get('[data-testid="session-chip"]'),

  /**
   * Book a member into the first session shown. Ticks "Drop-in" so a member
   * without an active subscription can still be booked. Booking happens on
   * clicking the member result (there is no separate submit button).
   */
  bookFirstSession(memberQuery: string) {
    SchedulePage.sessions().first().click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.contains('label', 'Drop-in').find('input[type="checkbox"]').check()
    cy.get('[data-testid="booking-member-search"]').type(memberQuery)
    cy.get('[data-testid="booking-member-result"]', { timeout: 10000 }).first().click()
    cy.contains(/Booked|waitlist/i, { timeout: 10000 }).should('be.visible')
  },
}
