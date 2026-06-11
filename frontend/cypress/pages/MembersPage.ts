/// <reference types="cypress" />

// Page object for the Members list + 360 page.
export const MembersPage = {
  visit: () => cy.visit('/gym/members'),

  searchBox: () => cy.get('input[aria-label="Search members"]'),
  rows: () => cy.get('[data-testid="member-row"]'),
  addButton: () => cy.contains('button', 'Add Member'),

  search(q: string) {
    MembersPage.searchBox().clear().type(q)
  },

  openFirst() {
    MembersPage.rows().first().click()
  },
}
