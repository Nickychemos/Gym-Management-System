import { MembersPage } from '../pages/MembersPage'

describe('02 - Members', () => {
  // Cached session: logs in once, reused across both tests below.
  beforeEach(() => cy.login())

  it('lists members and opens a 360 page', () => {
    MembersPage.visit()

    MembersPage.rows().should('have.length.greaterThan', 0)
    MembersPage.openFirst()

    cy.location('pathname').should('match', /\/gym\/members\/.+/)
    cy.contains('Overview').should('be.visible')
    cy.contains('Analytics').should('be.visible')
  })

  it('filters the list by search', () => {
    MembersPage.visit()
    MembersPage.rows().should('have.length.greaterThan', 0)

    MembersPage.search('z')
    // The list either narrows to matches or shows the empty state, but the
    // page must never error.
    cy.contains(/No members match|member-row/i, { matchCase: false })
    cy.get('body').should('not.contain', "Couldn't load members")
  })
})
