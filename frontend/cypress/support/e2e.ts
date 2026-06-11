// Loaded before every spec file. Keep this thin: it just wires up our custom
// commands (cy.login, etc.). Add global hooks or behaviour overrides here.
import './commands'

// Cypress fails a test on ANY uncaught exception from the app. When cy.session
// blanks the page to about:blank between tests, the socket.io real-time client
// (NotificationBell) keeps trying to reconnect and touches `document` after it's
// gone, throwing "Cannot read properties of null (reading 'document')". That is
// teardown noise from a background script, not a failure in the flow under test,
// so swallow exactly that error and let every other app error still fail tests.
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes("reading 'document'")) return false
  return undefined
})
