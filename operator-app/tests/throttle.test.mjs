// Tests for the rules that decide when a GPS fix is sent. Run with: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceMeters, HEARTBEAT_MS, MIN_GAP_MS, shouldSend } from '../src/location/throttle.js';

// A point near Catholic University, and helpers to make fixes relative to it.
const base = { latitude: 38.9335, longitude: -76.9973, accuracy: 20, timestamp: 1_000_000 };
const later = (ms, extra = {}) => ({ ...base, timestamp: base.timestamp + ms, ...extra });
const north = (meters) => base.latitude + meters / 111_320; // about 111,320 m per degree of latitude

test('distance: 0.001 degrees of latitude is about 111 m', () => {
  const d = distanceMeters(base, { ...base, latitude: base.latitude + 0.001 });
  assert.ok(Math.abs(d - 111) < 1, `got ${d}`);
});

test('the first fix is always sent', () => {
  assert.equal(shouldSend(null, base), true);
});

test('a parked truck still checks in once a minute', () => {
  assert.equal(shouldSend(base, later(HEARTBEAT_MS - 1)), false);
  assert.equal(shouldSend(base, later(HEARTBEAT_MS)), true);
});

test('moving 150 m or more sends early, but not more than every 15 seconds', () => {
  const moved = (ms) => later(ms, { latitude: north(200) });
  assert.equal(shouldSend(base, moved(MIN_GAP_MS - 1)), false);
  assert.equal(shouldSend(base, moved(MIN_GAP_MS)), true);
});

test('small movements wait for the minute check-in', () => {
  assert.equal(shouldSend(base, later(30_000, { latitude: north(100) })), false);
});

test('very inaccurate fixes are skipped unless nothing was sent for 2 minutes', () => {
  const rough = (ms) => later(ms, { accuracy: 900, latitude: north(500) });
  assert.equal(shouldSend(base, rough(HEARTBEAT_MS)), false);
  assert.equal(shouldSend(base, rough(2 * HEARTBEAT_MS)), true);
});

test('a fix older than the last one sent is ignored', () => {
  assert.equal(shouldSend(base, later(-5_000, { latitude: north(1000) })), false);
});
