/// <reference types="cypress" />

// Helpers for generating unique, identifiable test data. Date.now() is fine in
// Cypress's browser runtime (unlike workflow scripts). Everything is prefixed
// "QA" so test records are easy to spot and sweep up later.

export function suffix(): string {
  return `${Date.now()}`.slice(-7)
}

export function testMemberName(tag = 'Member'): string {
  return `QA ${tag} ${suffix()}`
}

/** Kenyan mobile format (2547XXXXXXXX), randomised tail to stay unique. */
export function testPhone(): string {
  return `2547${`${Date.now()}`.slice(-8)}`
}
