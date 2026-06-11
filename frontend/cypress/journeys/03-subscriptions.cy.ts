import { testMemberName, testPhone } from '../support/data'
import { MembersPage } from '../pages/MembersPage'
import { SubscriptionsPanel } from '../pages/SubscriptionsPanel'

// Subscribing to the mid-priced "Standard Monthly" plan exposes both Upgrade
// (Premium) and Downgrade (Day Pass), so the full lifecycle is reachable.
describe('03 - Subscriptions', () => {
  beforeEach(() => cy.login())

  function freshMemberOnSubsTab(tag: string) {
    MembersPage.createViaUi(testMemberName(tag), testPhone())
    SubscriptionsPanel.open()
  }

  it('shows an empty state before any subscription', () => {
    freshMemberOnSubsTab('Empty')
    cy.contains('No subscriptions').should('be.visible')
  })

  it('starts a subscription on a fresh member', () => {
    freshMemberOnSubsTab('Start')
    SubscriptionsPanel.addPlan(/standard/i)
    cy.contains('Active').should('be.visible')
  })

  it('cancels the add-subscription dialog without creating', () => {
    freshMemberOnSubsTab('Cancel')
    cy.get('[data-testid="sub-add-trigger"]').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[role="dialog"]').contains('button', 'Cancel').click()
    cy.contains('No subscriptions').should('be.visible')
  })

  it('renews without forfeiting days', () => {
    freshMemberOnSubsTab('Renew')
    SubscriptionsPanel.addPlan(/standard/i)
    SubscriptionsPanel.renew()
  })

  it('schedules an upgrade to a higher plan', () => {
    freshMemberOnSubsTab('Upgrade')
    SubscriptionsPanel.addPlan(/standard/i)
    SubscriptionsPanel.changePlan('Upgrade')
    cy.contains('Upgrade scheduled', { timeout: 10000 }).should('be.visible')
  })

  it('schedules a downgrade to a lower plan', () => {
    // Subscribe to the top plan so a lower target (Standard) exists; the Day
    // Pass is never a change target.
    freshMemberOnSubsTab('Downgrade')
    SubscriptionsPanel.addPlan(/premium/i)
    SubscriptionsPanel.changePlan('Downgrade')
    cy.contains('Downgrade scheduled', { timeout: 10000 }).should('be.visible')
  })

  it('blocks stacking a second plan change', () => {
    freshMemberOnSubsTab('Stack')
    SubscriptionsPanel.addPlan(/standard/i)
    SubscriptionsPanel.changePlan('Upgrade')
    cy.contains('Upgrade scheduled').should('be.visible')
    // A second change while one is already scheduled is rejected.
    SubscriptionsPanel.changePlan('Upgrade')
    cy.contains(/already scheduled/i, { timeout: 10000 }).should('be.visible')
  })

  it('requires a plan when scheduling a change', () => {
    freshMemberOnSubsTab('PickPlan')
    SubscriptionsPanel.addPlan(/standard/i)
    cy.contains('button', 'Upgrade').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[role="dialog"]').contains('button', /Schedule upgrade/i).click()
    cy.contains('Pick a plan').should('be.visible')
  })

  it('freezes and then resumes a subscription', () => {
    freshMemberOnSubsTab('Freeze')
    SubscriptionsPanel.addPlan(/standard/i)
    SubscriptionsPanel.freeze()
    SubscriptionsPanel.resume()
  })

  it('removes a subscription added by mistake (manager only)', () => {
    freshMemberOnSubsTab('Remove')
    SubscriptionsPanel.addPlan(/standard/i)
    SubscriptionsPanel.remove()
    cy.contains('No subscriptions', { timeout: 10000 }).should('be.visible')
  })
})
