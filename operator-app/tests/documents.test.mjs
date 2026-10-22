// Tests for document status, form checks and dates. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, formatDate, timeAgo } from '../src/lib/dates.js';
import { allRequiredUploaded, allRequiredValid, daysUntil, summarize } from '../src/lib/documents.js';
import { checkExpiryDate, checkPhone, parseMoney, PHONE_PATTERN } from '../src/lib/validate.js';

const today = new Date(2026, 9, 22); // Oct 22, 2026, local time
const doc = (kind, expires_on, verified, created_at) => ({ kind, expires_on, verified, created_at });

test('daysUntil counts whole days; the expiry day itself is 0', () => {
  assert.equal(daysUntil('2026-10-22', today), 0);
  assert.equal(daysUntil('2026-10-23', today), 1);
  assert.equal(daysUntil('2026-10-21', today), -1);
});

test('no documents: missing, and not listable', () => {
  assert.equal(summarize([], 'insurance', today).state, 'missing');
  assert.equal(allRequiredValid([], today), false);
  assert.equal(allRequiredUploaded([], today), false);
});

test('uploaded but not checked yet: waiting for review', () => {
  const docs = [doc('tow_license', '2027-06-30', false, 't1'), doc('insurance', '2027-06-30', false, 't1')];
  assert.equal(summarize(docs, 'insurance', today).state, 'review');
  assert.equal(allRequiredUploaded(docs, today), true);
  assert.equal(allRequiredValid(docs, today), false);
});

test('verified and far from expiry: verified and listable', () => {
  const docs = [doc('tow_license', '2027-06-30', true, 't1'), doc('insurance', '2027-06-30', true, 't1')];
  assert.equal(summarize(docs, 'tow_license', today).state, 'verified');
  assert.equal(allRequiredValid(docs, today), true);
});

test('within 30 days of expiry: expiring', () => {
  const docs = [doc('insurance', '2026-11-10', true, 't1')];
  assert.equal(summarize(docs, 'insurance', today).state, 'expiring');
});

test('expired and nothing newer: expired', () => {
  const docs = [doc('insurance', '2026-10-01', true, 't1')];
  assert.equal(summarize(docs, 'insurance', today).state, 'expired');
  assert.equal(allRequiredUploaded([...docs, doc('tow_license', '2027-01-01', true, 't1')], today), false);
});

test('renewal in review keeps the old verified record in effect', () => {
  const docs = [doc('insurance', '2026-11-01', true, 't1'), doc('insurance', '2027-11-01', false, 't2')];
  const s = summarize(docs, 'insurance', today);
  assert.equal(s.current.expires_on, '2026-11-01');
  assert.equal(s.pending.expires_on, '2027-11-01');
});

test('expiry date check', () => {
  assert.equal(checkExpiryDate('2027-06-30', today), null);
  assert.match(checkExpiryDate('06/30/2027', today), /YYYY-MM-DD/);
  assert.match(checkExpiryDate('2027-02-31', today), /does not exist/);
  assert.match(checkExpiryDate('2026-10-21', today), /expired/);
  assert.equal(checkExpiryDate('2026-10-22', today), null);
});

test('phone check matches the database pattern', () => {
  assert.equal(PHONE_PATTERN.source, '^\\+?[0-9 ().-]{7,20}$');
  assert.equal(checkPhone('(202) 555-0142'), null);
  assert.notEqual(checkPhone('call me'), null);
});

test('money parsing', () => {
  assert.deepEqual(parseMoney('$95'), { value: 95, error: null });
  assert.deepEqual(parseMoney('4.50'), { value: 4.5, error: null });
  assert.deepEqual(parseMoney(''), { value: null, error: null });
  assert.notEqual(parseMoney('4.555').error, null);
  assert.notEqual(parseMoney('-3').error, null);
});

test('dates format without time-zone shifts', () => {
  assert.equal(formatDate('2027-06-30'), 'Jun 30, 2027');
  assert.equal(addDays(365, today), '2027-10-22');
  assert.equal(timeAgo(1_000_000, 1_000_000 + 30_000), 'just now');
  assert.equal(timeAgo(1_000_000, 1_000_000 + 3 * 60_000), '3 min ago');
});
