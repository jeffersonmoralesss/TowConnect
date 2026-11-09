// Tests for the DC tow company import (supabase/scripts/import-dc-tow-companies.mjs).
// The real download needs DC's server, so these feed the script's logic with sample rows shaped
// exactly like DC's data, then run the SQL it writes against a real (in-memory) database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lit, pickCompanies, tidyName, toDate, toSql } from '../scripts/import-dc-tow-companies.mjs'
import { makeDb } from './stub.mjs'

// Sample rows in DC's format (ArcGIS "features"). Dates are milliseconds since 1970.
const ms = (iso) => Date.parse(`${iso}T12:00:00Z`)
const row = (a) => ({
  attributes: {
    LICENSESTATUS: 'Active',
    LICENSETYPE: 'Motor Vehicle',
    BUSINESSACTIVITY: 'Tow Truck Business',
    CATEGORYSERVICETYPE: null,
    ENTITYTRADENAME: null,
    LATITUDE: 38.92,
    LONGITUDE: -76.99,
    PREMISEADDRESS: '100 SAMPLE ST NE',
    LICENSEENDDATE: ms('2027-03-31'),
    ...a,
  },
})
const sample = [
  row({ CUSTOMERNUMBER: 'A1', ENTITYNAME: "O'REILLY TOWING LLC" }),
  row({ CUSTOMERNUMBER: 'A1', ENTITYNAME: "O'REILLY TOWING LLC", LICENSEENDDATE: ms('2025-03-31') }), // older license, same business
  row({ CUSTOMERNUMBER: 'B2', ENTITYNAME: 'BIG HOLDINGS INC', ENTITYTRADENAME: 'CAPITAL ROADSIDE' }),
  row({ CUSTOMERNUMBER: 'C3', ENTITYNAME: 'CLOSED TOW CO', LICENSESTATUS: 'Inactive' }),
  row({ CUSTOMERNUMBER: 'D4', ENTITYNAME: 'STORAGE ONLY LLC', BUSINESSACTIVITY: 'Tow Truck Storage Lot' }),
  row({ CUSTOMERNUMBER: 'E5', ENTITYNAME: 'CATEGORY IN OTHER FIELD', BUSINESSACTIVITY: 'Motor Vehicle', CATEGORYSERVICETYPE: 'Tow Truck Business' }),
]

test('keeps only active tow truck businesses, one row each', () => {
  const companies = pickCompanies(sample)
  assert.deepEqual(companies.map((c) => c.dc_customer_number).sort(), ['A1', 'B2', 'E5'])
})

test('keeps the longest-running license when a business has several', () => {
  const a1 = pickCompanies(sample).find((c) => c.dc_customer_number === 'A1')
  assert.equal(a1.license_end_date, '2027-03-31')
})

test('uses the trade name when there is one, and tidies capitals', () => {
  const companies = pickCompanies(sample)
  assert.equal(companies.find((c) => c.dc_customer_number === 'B2').name, 'Capital Roadside')
  assert.equal(companies.find((c) => c.dc_customer_number === 'A1').name, "O'reilly Towing LLC")
  assert.equal(tidyName('  SMITH   TOWING  INC. '), 'Smith Towing INC.')
})

test('never carries owner or agent names', () => {
  const withOwner = [row({ CUSTOMERNUMBER: 'F6', ENTITYNAME: 'FAMILY TOW', BUSINESSOWNERFIRSTNAME: 'Jane', AGENTLASTNAME: 'Doe' })]
  const [c] = pickCompanies(withOwner)
  assert.deepEqual(Object.keys(c).sort(), ['address', 'dc_customer_number', 'lat', 'license_end_date', 'license_status', 'lng', 'name'])
})

test('dates and SQL quoting', () => {
  assert.equal(toDate(ms('2027-03-31')), '2027-03-31')
  assert.equal(toDate(null), null)
  assert.equal(lit("O'Reilly"), "'O''Reilly'")
  assert.equal(lit(null), 'null')
  assert.equal(lit(38.5), '38.5')
})

test('the generated SQL runs, adds hidden listings, and a re-import keeps human review', async () => {
  const db = await makeDb()

  // First import
  await db.exec(toSql(pickCompanies(sample), '2026-11-09'))
  let rows = (await db.query(`select * from public.listed_companies order by dc_customer_number`)).rows
  assert.equal(rows.length, 3)
  assert.ok(rows.every((r) => r.review_status === 'new' && r.source === 'dc_license'), 'imported as new (hidden)')
  assert.equal(rows[0].name, "O'reilly Towing LLC")
  let visible = (await db.query(`select * from public.nearby_listed_companies(38.92, -76.99)`)).rows
  assert.equal(visible.length, 0, 'drivers see nothing until a person publishes')

  // A reviewer adds a phone number and publishes one listing, and hides another
  await db.exec(`update public.listed_companies set phone = '(202) 555-0190', review_status = 'published' where dc_customer_number = 'A1'`)
  await db.exec(`update public.listed_companies set review_status = 'hidden', reviewer_notes = 'Private-lot towing only' where dc_customer_number = 'B2'`)
  visible = (await db.query(`select * from public.nearby_listed_companies(38.92, -76.99)`)).rows
  assert.equal(visible.length, 1)

  // A month later: A1 renewed, B2 still active, E5 no longer active in DC's data
  const later = [
    row({ CUSTOMERNUMBER: 'A1', ENTITYNAME: "O'REILLY TOWING LLC", LICENSEENDDATE: ms('2028-03-31') }),
    row({ CUSTOMERNUMBER: 'B2', ENTITYNAME: 'BIG HOLDINGS INC', ENTITYTRADENAME: 'CAPITAL ROADSIDE' }),
  ]
  await db.exec(toSql(pickCompanies(later), '2026-12-09'))
  rows = (await db.query(`select * from public.listed_companies order by dc_customer_number`)).rows
  const byId = Object.fromEntries(rows.map((r) => [r.dc_customer_number, r]))
  assert.equal(byId.A1.phone, '(202) 555-0190', 're-import keeps the phone a person added')
  assert.equal(byId.A1.review_status, 'published', 're-import keeps the review decision')
  assert.equal(new Date(byId.A1.license_end_date).toISOString().slice(0, 10), '2028-03-31', 're-import refreshes the license date')
  assert.equal(byId.B2.review_status, 'hidden', 'a hidden listing stays hidden')
  assert.ok(new Date(byId.E5.license_end_date) < new Date('2026-12-09'), 'a business gone from DC data gets an ended license')
  assert.equal(byId.E5.license_status, 'Not active in DC data')
})

test('an empty download writes harmless SQL', () => {
  assert.match(toSql([]), /Nothing to import/)
})
