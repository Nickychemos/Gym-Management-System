/// <reference types="cypress" />

// Page object for /classes (Class Types catalogue + Schedules) and the
// ScheduleDrawer used to create a recurring class.
export const ClassesPage = {
  visitTypes: () => cy.visit('/gym/classes'),
  visitSchedules: () => cy.visit('/gym/classes?tab=schedules'),

  newTypeBtn: () => cy.contains('button', 'New class type'),
  newScheduleBtn: () => cy.contains('button', 'New schedule'),

  openNewSchedule() {
    ClassesPage.visitSchedules()
    ClassesPage.newScheduleBtn().should('be.visible').click()
    cy.contains('New schedule').should('be.visible')
  },

  /** Select the first real option of a testid'd <select>, waiting for its
   *  options to load first (they arrive async from class_form_options). */
  selectFirst(testid: string) {
    cy.get(`[data-testid="${testid}"] option`).should('have.length.greaterThan', 1)
    cy.get(`[data-testid="${testid}"]`).then(($s) => {
      const v = ($s.find('option').toArray() as HTMLOptionElement[])
        .map((o) => o.value)
        .find(Boolean)
      cy.wrap($s).select(v as string)
    })
  },

  /** Fill + submit the New schedule drawer for all 7 days. Assumes class
   *  type/trainer/branch options exist (guard before calling). */
  createScheduleAllDays() {
    ClassesPage.selectFirst('sched-class-type')
    ClassesPage.selectFirst('sched-trainer')
    ClassesPage.selectFirst('sched-branch')
    // Defaults are mon/wed/fri; turn ON every off day so all 7 are selected and
    // a session exists today whatever the weekday. .each (not a shifting
    // multiple-click set) keeps the keyed buttons stable across re-renders.
    cy.get('[data-testid="schedule-day"]').each(($btn) => {
      if (!$btn.hasClass('bg-brand-50')) cy.wrap($btn).click()
    })
    cy.contains('button', 'Create').click()
    cy.contains('Schedule created', { timeout: 12000 }).should('be.visible')
  },
}
