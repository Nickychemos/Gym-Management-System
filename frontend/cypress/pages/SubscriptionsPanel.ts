/// <reference types="cypress" />

// Actions on the Subscriptions tab of a member's 360 page.
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export const SubscriptionsPanel = {
  open() {
    cy.contains('[role="tab"]', 'Subscriptions').click()
    // Wait for the panel to finish loading. Clicking a trigger while the list is
    // still loading drops the click (the open state never sticks).
    cy.contains(/No subscriptions|Active|Draft|Expired|Lapsed|Frozen|Cancelled/, {
      timeout: 10000,
    }).should('be.visible')
  },

  /** Start a subscription. planMatch picks a specific plan (defaults to the
   *  first recurring, i.e. non-Day-Pass, plan). */
  addPlan(planMatch?: RegExp) {
    cy.get('[data-testid="sub-add-trigger"]').click()
    cy.get('[role="dialog"]', { timeout: 8000 }).should('be.visible')

    const sel = () => cy.get('[data-testid="sub-plan-select"]')
    sel().find('option').should('have.length.greaterThan', 1)
    sel().then(($s) => {
      const opts = $s.find('option').toArray() as HTMLOptionElement[]
      const pick = planMatch
        ? opts.find((o) => o.value && planMatch.test(o.textContent || ''))
        : opts.find((o) => o.value && !/day pass/i.test(o.textContent || '')) ??
          opts.find((o) => o.value)
      expect(pick, 'a matching membership plan exists').to.exist
      cy.wrap($s).select((pick as HTMLOptionElement).value)
    })
    sel().should('not.have.value', '')

    cy.get('[data-testid="sub-start-submit"]').click()
    cy.contains('Subscription started', { timeout: 10000 }).should('be.visible')
    // Settle: the active sub row must render before any lifecycle action.
    cy.contains('Active', { timeout: 10000 }).should('be.visible')
  },

  addFirstPlan() {
    SubscriptionsPanel.addPlan()
  },

  renew() {
    cy.contains('button', 'Renew').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[role="dialog"]').contains('button', 'Renew').click()
    cy.contains('Subscription renewed', { timeout: 10000 }).should('be.visible')
  },

  /** Open the Upgrade/Downgrade dialog, pick the first target plan, schedule it.
   *  Does not assert the result toast (the caller does, since anti-stacking
   *  expects an error toast instead of a success one). */
  changePlan(verb: 'Upgrade' | 'Downgrade') {
    cy.contains('button', verb).click()
    cy.get('[role="dialog"]').should('be.visible')
    const sel = () => cy.get('[role="dialog"] select')
    sel().find('option').should('have.length.greaterThan', 1)
    sel().then(($s) => {
      const v = ($s.find('option').toArray() as HTMLOptionElement[])
        .map((o) => o.value)
        .find(Boolean)
      cy.wrap($s).select(v as string)
    })
    cy.get('[role="dialog"]').contains('button', `Schedule ${verb.toLowerCase()}`).click()
  },

  freeze() {
    const today = new Date()
    const end = new Date(today.getTime() + 7 * 864e5)
    cy.contains('button', 'Freeze').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[role="dialog"]').find('input[type="date"]').eq(0).clear().type(fmtDate(today))
    cy.get('[role="dialog"]').find('input[type="date"]').eq(1).clear().type(fmtDate(end))
    cy.get('[role="dialog"]').contains('button', 'Freeze').click()
    cy.contains(/Frozen \d+ days/, { timeout: 10000 }).should('be.visible')
  },

  resume() {
    cy.contains('button', 'Resume').click()
    cy.contains('Resumed', { timeout: 10000 }).should('be.visible')
  },

  remove() {
    cy.contains('button', 'Remove').click()
    cy.get('[role="dialog"]').should('be.visible')
    cy.get('[role="dialog"]').contains('button', 'Remove').click()
    cy.contains('Subscription removed', { timeout: 10000 }).should('be.visible')
  },
}
