// The operator web app reuses four plain-JavaScript files from the Android app (form checks,
// document rules, dates, and the send throttle). They're copies, not links, because the Android
// build tool (Metro) and the web build tool (Vite) each want files inside their own folder.
// This test fails if a copy ever drifts from the original, so a fix in one place can't be forgotten
// in the other. To fix a failure: make the change in operator-app, then copy the file over.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const here = new URL('../', import.meta.url)
const pairs = [
  ['src/shared/validate.js', '../operator-app/src/lib/validate.js'],
  ['src/shared/documents.js', '../operator-app/src/lib/documents.js'],
  ['src/shared/dates.js', '../operator-app/src/lib/dates.js'],
  ['src/shared/throttle.js', '../operator-app/src/location/throttle.js'],
  ['src/lib/useOperatorData.js', '../operator-app/src/lib/useOperatorData.js'],
]

for (const [copy, original] of pairs) {
  test(`${copy} matches ${original}`, () => {
    const a = readFileSync(new URL(copy, here), 'utf8')
    const b = readFileSync(new URL(original, here), 'utf8')
    assert.equal(a, b, `${copy} has drifted from ${original}`)
  })
}
