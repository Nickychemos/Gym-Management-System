import { testMemberName, testPhone } from '../support/data'
import { MembersPage } from '../pages/MembersPage'
import { ClassesPage } from '../pages/ClassesPage'
import { SchedulePage } from '../pages/SchedulePage'

describe('05 - Classes', () => {
  beforeEach(() => cy.login())

  describe('catalogue and tabs', () => {
    it('shows the Class Types catalogue', () => {
      ClassesPage.visitTypes()
      cy.contains('h1', 'Classes').should('be.visible')
      ClassesPage.newTypeBtn().should('be.visible')
    })

    it('switches to the Schedules tab', () => {
      ClassesPage.visitTypes()
      cy.contains('[role="tab"]', 'Schedules').click()
      ClassesPage.newScheduleBtn().should('be.visible')
    })

    it('opens and cancels the New class type drawer', () => {
      ClassesPage.visitTypes()
      ClassesPage.newTypeBtn().click()
      cy.contains('button', 'Cancel').click()
      ClassesPage.newTypeBtn().should('be.visible')
    })

    it('opens and cancels the New schedule drawer', () => {
      ClassesPage.openNewSchedule()
      cy.contains('button', 'Cancel').click()
      ClassesPage.newScheduleBtn().should('be.visible')
    })
  })

  describe('schedule creation validation', () => {
    it('requires a class type', () => {
      ClassesPage.openNewSchedule()
      cy.contains('button', 'Create').click()
      cy.contains('Pick a class type').should('be.visible')
    })

    it('requires a trainer once a class type is set', () => {
      ClassesPage.openNewSchedule()
      ClassesPage.selectFirst('sched-class-type')
      cy.contains('button', 'Create').click()
      cy.contains('Pick a trainer').should('be.visible')
    })

    it('requires at least one day', () => {
      ClassesPage.openNewSchedule()
      ClassesPage.selectFirst('sched-class-type')
      ClassesPage.selectFirst('sched-trainer')
      ClassesPage.selectFirst('sched-branch')
      // Clear the pre-selected mon/wed/fri so no days remain.
      cy.get('[data-testid="schedule-day"].bg-brand-50').each(($d) => cy.wrap($d).click())
      cy.contains('button', 'Create').click()
      cy.contains('Pick at least one day').should('be.visible')
    })

    it('creates a recurring schedule for all days', () => {
      ClassesPage.openNewSchedule()
      ClassesPage.createScheduleAllDays()
    })
  })

  describe('weekly schedule and booking', () => {
    it('shows the weekly schedule', () => {
      SchedulePage.visit()
      cy.contains('h1', 'Schedule').should('be.visible')
    })

    it('books a member into a session and checks them in', function () {
      const name = testMemberName('Class')
      // View all branches so the seeded session is visible whatever branch it
      // lands in (the schedule view otherwise filters to the default branch).
      cy.visit('/gym/')
      cy.window().then((w) => w.localStorage.setItem('benisho:branch', '__all__'))

      MembersPage.createViaUi(name, testPhone())

      // Seed a session this week so a chip exists to book against.
      ClassesPage.openNewSchedule()
      ClassesPage.createScheduleAllDays()

      SchedulePage.visit()
      cy.contains('h1', 'Schedule').should('be.visible')
      // We just seeded an all-days, all-branches schedule, so a session must show.
      SchedulePage.sessions().should('have.length.greaterThan', 0)
      SchedulePage.bookFirstSession(name)
      cy.get('[aria-label="Check in"]').first().click()
      cy.contains('Checked in', { timeout: 10000 }).should('be.visible')
    })
  })
})
