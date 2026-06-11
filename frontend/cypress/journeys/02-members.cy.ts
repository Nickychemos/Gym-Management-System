import { testMemberName, testPhone } from '../support/data'
import { MembersPage } from '../pages/MembersPage'

// Gold-standard depth for one module. Same shape (list / validation / create /
// sub-flows) is the template for every other module.
describe('02 - Members', () => {
  beforeEach(() => cy.login())

  // ---- List behaviours ----
  describe('list', () => {
    beforeEach(() => MembersPage.visit())

    it('renders the members table with a total count', () => {
      MembersPage.rows().should('have.length.greaterThan', 0)
      cy.contains(/\d+ total/).should('be.visible')
    })

    it('searches by name and narrows the list', () => {
      MembersPage.rows()
        .first()
        .find('.font-medium')
        .first()
        .invoke('text')
        .then((name) => {
          const token = name.trim().split(' ')[0]
          MembersPage.search(token)
          MembersPage.rows().first().should('contain', token)
        })
    })

    it('filters by Active status', () => {
      cy.get('select[aria-label="Filter by status"]').select('Active')
      cy.location('search').should('contain', 'status=Active')
      cy.get('body').should('not.contain', "Couldn't load")
    })

    it('clears active filters', () => {
      cy.get('select[aria-label="Filter by status"]').select('Frozen')
      cy.contains('button', 'Clear').click()
      cy.location('search').should('not.contain', 'status')
    })

    it('shows an empty state when nothing matches', () => {
      MembersPage.search('zzz-no-such-member-xyz')
      cy.contains(/No members match/i).should('be.visible')
    })

    it('opens a 360 page from a row', () => {
      MembersPage.openFirst()
      cy.location('pathname').should('match', /\/gym\/members\/.+/)
      cy.contains('[role="tab"]', 'Overview').should('be.visible')
    })

    it('paginates when there is more than one page', function () {
      cy.get('body').then(($b) => {
        const next = $b.find('button:contains("Next")')
        if (!next.length || next.is(':disabled')) {
          cy.log('Only one page of members -- skipping pagination.')
          this.skip()
        }
      })
      cy.contains('button', 'Next').click()
      cy.contains(/Page 2 of/).should('be.visible')
      cy.contains('button', 'Prev').click()
      cy.contains(/Page 1 of/).should('be.visible')
    })
  })

  // ---- Add Member validation ----
  describe('add member validation', () => {
    beforeEach(() => {
      MembersPage.visit()
      MembersPage.addButton().click()
      cy.get('input[name="full_name"]').should('be.visible')
    })

    it('requires a full name', () => {
      cy.get('[data-testid="add-member-submit"]').click()
      cy.contains('Enter the member’s full name').should('be.visible')
    })

    it('requires a valid phone number', () => {
      cy.get('input[name="full_name"]').type('QA Validation')
      cy.get('[data-testid="add-member-submit"]').click()
      cy.contains('Enter a valid phone number').should('be.visible')
    })

    it('rejects an invalid email', () => {
      cy.get('input[name="full_name"]').type('QA Validation')
      cy.get('input[name="phone"]').type('254712345678')
      cy.get('input[name="email"]').type('not-an-email')
      cy.get('[data-testid="add-member-submit"]').click()
      cy.contains('Enter a valid email').should('be.visible')
    })

    it('cancels without creating a member', () => {
      cy.contains('button', 'Cancel').click()
      cy.get('input[name="full_name"]').should('not.exist')
      cy.location('pathname').should('eq', '/gym/members')
    })
  })

  // ---- Create + the 360 page ----
  describe('create and 360 page', () => {
    it('creates a member with the minimum fields', () => {
      const name = testMemberName('Min')
      MembersPage.createViaUi(name, testPhone())
      cy.contains(name).should('be.visible')
    })

    it('creates a member with full optional details', () => {
      const name = testMemberName('Full')
      MembersPage.visit()
      MembersPage.addButton().click()
      cy.get('input[name="full_name"]').type(name)
      cy.get('input[name="phone"]').type(testPhone())
      cy.get('body').then(($b) => {
        if ($b.find('select[name="home_branch"]').length) {
          cy.get('select[name="home_branch"] option').then(($o) => {
            const v = [...$o].map((o) => (o as HTMLOptionElement).value).find(Boolean)
            if (v) cy.get('select[name="home_branch"]').select(v)
          })
        }
      })
      cy.get('select[name="gender"]').select('Female')
      cy.get('input[name="email"]').type('qa.full@example.com')
      cy.get('input[name="emergency_contact_name"]').type('QA Kin')
      cy.get('select[name="source"]').select('Referral')
      cy.get('[data-testid="add-member-submit"]').click()
      cy.location('pathname', { timeout: 12000 }).should('match', /\/gym\/members\/.+/)
      cy.contains(name).should('be.visible')
    })

    it('navigates every tab without erroring', () => {
      MembersPage.createViaUi(testMemberName('Tabs'), testPhone())
      const tabs = ['Subscriptions', 'Classes', 'Payments', 'Coaching', 'Notes', 'Analytics', 'Overview']
      tabs.forEach((t) => {
        cy.contains('[role="tab"]', t).click()
        cy.get('body').should('not.contain', "Couldn't load")
      })
    })

    it('renders the Analytics tab', () => {
      MembersPage.createViaUi(testMemberName('An'), testPhone())
      cy.contains('[role="tab"]', 'Analytics').click()
      cy.contains(/Tenure|Retention|Visits|Attendance|Engagement|Risk/i, {
        timeout: 12000,
      }).should('be.visible')
    })

    it('adds a note and shows it in the timeline', () => {
      MembersPage.createViaUi(testMemberName('Note'), testPhone())
      cy.contains('[role="tab"]', 'Notes').click()
      const note = `QA note ${Date.now()}`
      cy.get('textarea[placeholder*="Write a note"]').type(note)
      cy.contains('button', 'Add note').click()
      cy.contains(note, { timeout: 10000 }).should('be.visible')
    })

    it('edits a member and saves the change', () => {
      MembersPage.createViaUi(testMemberName('Edit'), testPhone())
      cy.contains('button', 'Edit').click()
      cy.contains('Edit Member').should('be.visible')
      cy.get('input[type="email"]').clear().type('qa.edited@example.com')
      cy.contains('button', 'Save').click()
      cy.contains('Member updated', { timeout: 10000 }).should('be.visible')
    })
  })
})
