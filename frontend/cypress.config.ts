import { defineConfig } from 'cypress'

// E2E config. Cypress drives a real browser against the running Vite dev
// server (http://localhost:5173), which itself proxies /api + /socket.io to
// the Frappe backend. So both `bench start` and `npm run dev` must be up.
export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5173',
    specPattern: 'cypress/journeys/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    fixturesFolder: 'cypress/fixtures',
    video: false,
    viewportWidth: 1280,
    viewportHeight: 800,
    // The app is single-page; give navigation a little breathing room.
    defaultCommandTimeout: 8000,
  },
})
