import { ReportsPage } from '../pages/ReportsPage'

const REPORTS = [
  'revenue_summary',
  'membership_mrr',
  'class_attendance',
  'nps',
  'owner_snapshot',
]

describe('06 - Reports', () => {
  beforeEach(() => cy.login())

  it('shows the report catalogue', () => {
    ReportsPage.catalogue()
    cy.contains('h1', 'Reports').should('be.visible')
  })

  REPORTS.forEach((key) => {
    it(`opens and renders the "${key}" report`, () => {
      ReportsPage.openReport(key)
    })
  })
})
