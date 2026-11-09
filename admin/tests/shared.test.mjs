// The admin panel reuses two plain-JavaScript files from the operator app (document rules and dates),
// so "expiring soon" means exactly the same thing to an admin as to an operator. They're copies
// (each build tool wants files inside its own folder); this test fails if a copy drifts.
// To fix a failure: make the change in operator-app, then copy the file over.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const here = new URL('../', import.meta.url)
const pairs = [
  ['src/shared/documents.js', '../operator-app/src/lib/documents.js'],
  ['src/shared/dates.js', '../operator-app/src/lib/dates.js'],
]

for (const [copy, original] of pairs) {
  test(`${copy} matches ${original}`, () => {
    const a = readFileSync(new URL(copy, here), 'utf8')
    const b = readFileSync(new URL(original, here), 'utf8')
    assert.equal(a, b, `${copy} has drifted from ${original}`)
  })
}
