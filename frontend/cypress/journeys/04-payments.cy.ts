import { testMemberName, testPhone } from '../support/data'
import { MembersPage } from '../pages/MembersPage'
import { PaymentsPage } from '../pages/PaymentsPage'

describe('04 - Payments', () => {
  beforeEach(() => cy.login())

  describe('stream and filters', () => {
    beforeEach(() => PaymentsPage.visit())

    it('shows the KPI strip and M-Pesa stream', () => {
      cy.contains('Collected today').should('be.visible')
      cy.contains('MTD collected').should('be.visible')
      cy.get('body').should('not.contain', "Couldn't load payments")
    })

    it('filters by Success status', () => {
      PaymentsPage.statusFilter().select('Success')
      cy.location('search').should('contain', 'status=Success')
      cy.get('body').should('not.contain', "Couldn't load")
    })

    it('filters by Inbound direction', () => {
      PaymentsPage.directionFilter().select('Inbound')
      cy.location('search').should('contain', 'direction=Inbound')
    })

    it('searches the transaction stream', () => {
      PaymentsPage.searchBox().type('254')
      cy.location('search').should('contain', 'q=254')
      cy.get('body').should('not.contain', "Couldn't load")
    })

    it('clears active filters', () => {
      PaymentsPage.statusFilter().select('Pending')
      cy.contains('button', 'Clear').click()
      cy.location('search').should('not.contain', 'status')
    })

    it('shows an empty state for a no-match search', () => {
      PaymentsPage.searchBox().type('zzz-no-such-txn-xyz')
      cy.contains(/No matching transactions/i).should('be.visible')
    })

    it('switches to the Cash Drawer tab and back', () => {
      cy.contains('[role="tab"]', 'Cash Drawer').click()
      cy.location('search').should('contain', 'view=cash')
      cy.contains('[role="tab"]', 'M-Pesa').click()
      cy.get('body').should('not.contain', "Couldn't load")
    })
  })

  describe('record a payment', () => {
    it('records a payment for a member', () => {
      const name = testMemberName('Pay')
      MembersPage.createViaUi(name, testPhone())
      PaymentsPage.visit()
      PaymentsPage.recordPayment(name, '4500')
    })

    it('validates a missing amount', () => {
      PaymentsPage.visit()
      PaymentsPage.openStkModal()
      PaymentsPage.pickMember('QA')
      cy.get('[data-testid="stk-submit"]').click()
      cy.contains('Enter a valid amount').should('be.visible')
    })

    it('can change the picked member', () => {
      PaymentsPage.visit()
      PaymentsPage.openStkModal()
      PaymentsPage.pickMember('QA')
      cy.get('#amt').should('be.visible')
      cy.contains('button', 'Change').click()
      cy.get('[data-testid="member-picker-search"]').should('be.visible')
    })

    it('cancels the STK modal', () => {
      PaymentsPage.visit()
      PaymentsPage.openStkModal()
      cy.get('[role="dialog"]').contains('button', 'Cancel').click()
      cy.get('[role="dialog"]').should('not.exist')
    })

    it('opens STK from a member 360 Record Payment button', () => {
      MembersPage.createViaUi(testMemberName('Rec'), testPhone())
      cy.contains('button', 'Record Payment').click()
      cy.location('pathname').should('eq', '/gym/payments')
    })
  })
})
