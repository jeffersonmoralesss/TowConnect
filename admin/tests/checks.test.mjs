// Tests for the automatic operator checks and the directory listing rules.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkOperator, compareNames, findListingMatches, hasBlocker } from '../src/lib/checks.js'
import { checkListingPhone, parseLatLng, publishProblem } from '../src/lib/listing.js'

const today = new Date(2026, 10, 10) // Nov 10, 2026
const doc = (kind, expires_on, extra = {}) => ({ id: kind, kind, expires_on, file_path: `u/${kind}.pdf`, created_at: '2026-11-01', verified: false, ...extra })
const operator = (extra = {}) => ({
  id: 'op1',
  company_name: 'Smith Towing LLC',
  phone: '(202) 555-0100',
  license_number: 'DC-123',
  jurisdiction: 'DC',
  trucks: [{ type: 'flatbed' }],
  operator_documents: [doc('tow_license', '2027-06-30'), doc('insurance', '2027-03-01')],
  ...extra,
})
const dcListing = (name, license_end_date = '2027-12-31') => ({ id: name, name, source: 'dc_license', license_end_date })
const byId = (checks, id) => checks.find((c) => c.id === id)

test('names: legal words and punctuation are ignored', () => {
  assert.equal(compareNames('Smith Towing LLC', 'SMITH TOWING, L.L.C.'), 'exact')
  assert.equal(compareNames('Smith Towing LLC', 'Smith Towing, Inc.'), 'exact')
  assert.equal(compareNames("Joe's Tow & Recovery", 'Joes Tow and Recovery'), 'exact')
})

test('names: a shorter name inside a longer one is "close"', () => {
  assert.equal(compareNames('Smith Towing', 'Smith Towing and Recovery LLC'), 'close')
  assert.equal(compareNames('Capitol Wrecker', 'Capitol City Wrecker Service'), 'close')
})

test('names: generic-only names never match, and different companies do not match', () => {
  assert.equal(compareNames('Towing Service', 'Smith Towing Service'), null)
  assert.equal(compareNames('Smith Towing', 'Jones Towing'), null)
})

test('listing matches: exact first', () => {
  const m = findListingMatches('Smith Towing', [dcListing('Smith Towing and Recovery'), dcListing('Smith Towing Inc')])
  assert.deepEqual(m.map((x) => x.match), ['exact', 'close'])
})

test('a complete DC application passes every check', () => {
  const checks = checkOperator(operator(), { listings: [dcListing('Smith Towing')], today })
  assert.deepEqual(checks.map((c) => c.status), ['ok', 'ok', 'ok', 'ok', 'ok'])
  assert.equal(hasBlocker(checks), false)
})

test('missing or expired documents block approval', () => {
  const missing = checkOperator(operator({ operator_documents: [doc('tow_license', '2027-06-30')] }), { today })
  assert.equal(byId(missing, 'insurance').status, 'fail')
  assert.equal(hasBlocker(missing), true)
  const expired = checkOperator(operator({ operator_documents: [doc('tow_license', '2026-11-09'), doc('insurance', '2027-03-01')] }), { today })
  assert.match(byId(expired, 'tow_license').detail, /Expired Nov 9, 2026/)
  const noFile = checkOperator(operator({ operator_documents: [doc('tow_license', '2027-06-30', { file_path: null }), doc('insurance', '2027-03-01')] }), { today })
  assert.equal(byId(noFile, 'tow_license').status, 'fail', 'a typed date without a file does not count')
})

test('the newest upload is the one that counts', () => {
  const docs = [doc('insurance', '2026-01-01', { created_at: '2025-01-01' }), doc('insurance', '2027-03-01', { created_at: '2026-11-01' }), doc('tow_license', '2027-06-30')]
  assert.equal(byId(checkOperator(operator({ operator_documents: docs }), { today }), 'insurance').status, 'ok')
})

test('a document expiring within 30 days is a warning, not a block', () => {
  const c = byId(checkOperator(operator({ operator_documents: [doc('tow_license', '2026-11-30'), doc('insurance', '2027-03-01')] }), { today }), 'tow_license')
  assert.equal(c.status, 'warn')
})

test('DC license record: close name warns, ended license fails, none found warns', () => {
  assert.equal(byId(checkOperator(operator(), { listings: [dcListing('Smith Towing and Recovery')], today }), 'license_record').status, 'warn')
  assert.equal(byId(checkOperator(operator(), { listings: [dcListing('Smith Towing', '2026-01-01')], today }), 'license_record').status, 'fail')
  assert.equal(byId(checkOperator(operator(), { listings: [dcListing('Jones Towing')], today }), 'license_record').status, 'warn')
  assert.match(byId(checkOperator(operator(), { listings: [], today }), 'license_record').detail, /hasn't been imported/)
})

test('DC license record: an active license wins over an older ended one', () => {
  const listings = [dcListing('Smith Towing', '2025-01-01'), dcListing('Smith Towing Inc', '2027-12-31')]
  assert.equal(byId(checkOperator(operator(), { listings, today }), 'license_record').status, 'ok')
})

test('Maryland and Virginia operators get a manual-check warning', () => {
  const c = byId(checkOperator(operator({ jurisdiction: 'MD' }), { listings: [dcListing('Smith Towing')], today }), 'license_record')
  assert.equal(c.status, 'warn')
  assert.match(c.detail, /MD/)
})

test('duplicates: same phone (any format) or same license number', () => {
  const others = [{ id: 'op2', company_name: 'Other Co', phone: '+1 202-555-0100', license_number: 'X' }]
  assert.match(byId(checkOperator(operator(), { others, today }), 'duplicates').detail, /Same phone as Other Co/)
  const others2 = [{ id: 'op2', company_name: 'Other Co', phone: '301 555 0000', license_number: 'dc-123 ' }]
  assert.match(byId(checkOperator(operator(), { others: others2, today }), 'duplicates').detail, /Same license number/)
  const self = [{ id: 'op1', company_name: 'Smith Towing LLC', phone: '(202) 555-0100', license_number: 'DC-123' }]
  assert.equal(byId(checkOperator(operator(), { others: self, today }), 'duplicates').status, 'ok', 'an operator is not a duplicate of itself')
})

test('no trucks is a warning', () => {
  assert.equal(byId(checkOperator(operator({ trucks: [] }), { today }), 'trucks').status, 'warn')
})

test('lat/lng pasted from Google Maps', () => {
  assert.deepEqual(parseLatLng('38.9072, -77.0369'), { lat: 38.9072, lng: -77.0369 })
  assert.deepEqual(parseLatLng(' 38.9,-77 '), { lat: 38.9, lng: -77 })
})

test('lat/lng: nonsense and out-of-range values are rejected', () => {
  assert.equal(parseLatLng('Washington DC'), null)
  assert.equal(parseLatLng('95, -77'), null)
  assert.equal(parseLatLng('38.9, -200'), null)
  assert.equal(parseLatLng(''), null)
})

test('listing phone: empty is allowed, junk is not', () => {
  assert.equal(checkListingPhone(''), null)
  assert.equal(checkListingPhone('(202) 555-0142'), null)
  assert.match(checkListingPhone('call us'), /digits/)
})

test('publish rules', () => {
  const base = { phone: '(202) 555-0142', lat: 38.9, lng: -77, show_exact_location: true, area_label: null }
  assert.equal(publishProblem(base), null)
  assert.match(publishProblem({ ...base, phone: null }), /phone/)
  assert.match(publishProblem({ ...base, lat: null }), /location/)
  assert.match(publishProblem({ ...base, show_exact_location: false }), /area/)
  assert.equal(publishProblem({ ...base, show_exact_location: false, area_label: 'Northeast DC' }), null)
})
