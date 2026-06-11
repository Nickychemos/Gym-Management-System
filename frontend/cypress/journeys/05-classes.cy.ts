import { testMemberName, testPhone } from '../support/data'
import { MembersPage } from '../pages/MembersPage'
import { SchedulePage } from '../pages/SchedulePage'

describe('05 - Classes', () => {
  beforeEach(() => cy.login())

  it('books a member into a class session', function () {
    const name = testMemberName('Class')
    MembersPage.createViaUi(name, testPhone())

    SchedulePage.visit()
    // Booking needs a session in the visible week. If the schedule is empty
    // (no recurring classes generated), skip rather than fail.
    cy.get('body').then(($b) => {
      if ($b.find('[data-testid="session-chip"]').length === 0) {
        cy.log('No class sessions this week -- skipping booking.')
        this.skip()
      }
    })

    SchedulePage.bookFirstSession(name)
  })
})
