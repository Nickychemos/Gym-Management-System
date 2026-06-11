import { testMemberName, testPhone } from '../support/data'
import { MembersPage } from '../pages/MembersPage'
import { SubscriptionsPanel } from '../pages/SubscriptionsPanel'
import { PaymentsPage } from '../pages/PaymentsPage'
import { ReportsPage } from '../pages/ReportsPage'

// The "grand tour": one click drives the core business flow end to end across
// the system. Run this to watch a real member move through the whole funnel.
// Deeper, isolated checks live in the per-module journeys (03+).
describe('00 - Full system tour', () => {
  beforeEach(() => cy.login())

  it('onboards a member, subscribes, pays, and reports on it', () => {
    const name = testMemberName('Tour')
    const phone = testPhone()

    // 1. Dashboard loads.
    cy.visit('/gym/')
    cy.get('h1', { timeout: 12000 }).should('be.visible')

    // 2. Create a member through the real drawer -> lands on their 360 page.
    MembersPage.createViaUi(name, phone)
    cy.contains(name).should('be.visible')

    // 3. Start a subscription for them.
    SubscriptionsPanel.open()
    SubscriptionsPanel.addFirstPlan()

    // 4. Record a payment against that member.
    PaymentsPage.visit()
    PaymentsPage.recordPayment(name, '3000')

    // 5. Open the revenue report and confirm it renders.
    ReportsPage.openReport('revenue_summary')

    // 6. Back to the dashboard, still healthy.
    cy.visit('/gym/')
    cy.get('h1').should('be.visible')
  })
})
