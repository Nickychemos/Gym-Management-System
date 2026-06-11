/// <reference types="cypress" />

// Page object for the Members list, the Add Member drawer, and the 360 page.
export const MembersPage = {
  visit: () => cy.visit('/gym/members'),

  searchBox: () => cy.get('input[aria-label="Search members"]'),
  rows: () => cy.get('[data-testid="member-row"]'),
  addButton: () => cy.get('[data-testid="add-member-button"]'),

  search(q: string) {
    MembersPage.searchBox().clear().type(q)
  },

  openFirst() {
    MembersPage.rows().first().click()
  },

  /**
   * Create a member through the real Add Member drawer and land on their 360
   * page. Selects a branch when the multi-branch field is present (required on
   * multi-branch sites), so the member is branch-scoped and shows up in pickers.
   */
  createViaUi(name: string, phone: string) {
    MembersPage.visit()
    MembersPage.addButton().click()
    cy.get('input[name="full_name"]').type(name)
    cy.get('input[name="phone"]').type(phone)

    // Branch select only renders on multi-branch sites; pick the first real option.
    cy.get('body').then(($b) => {
      if ($b.find('select[name="home_branch"]').length) {
        cy.get('select[name="home_branch"] option').then(($opts) => {
          const val = [...$opts].map((o) => (o as HTMLOptionElement).value).find((v) => v)
          if (val) cy.get('select[name="home_branch"]').select(val)
        })
      }
    })

    cy.get('[data-testid="add-member-submit"]').click()
    cy.location('pathname', { timeout: 12000 }).should('match', /\/gym\/members\/.+/)
  },

  /** Click a tab on the 360 page by its visible label. */
  openTab(label: string) {
    cy.contains('[role="tab"]', label).click()
  },
}
