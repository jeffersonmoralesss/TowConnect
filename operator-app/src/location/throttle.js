// Decides whether a new GPS fix is worth sending to the database. Pure functions (no React, no
// network), so they run in tests/throttle.test.mjs exactly as they run on the phone.
//
// The phone can produce a fix every second. Sending all of them would drain the battery and blow
// through the free tier. Sending too few makes a truck vanish from the map (the database hides
// positions older than 10 minutes). These rules sit in between:
//
//   1. Always send the first fix, so the truck appears right away.
//   2. Send at least once a minute, even if the truck is parked. A parked truck waiting for calls is
//      the most common case, and it must not disappear.
//   3. Send sooner if the truck has moved 150 m or more, but never more than once every 15 seconds.
//   4. Ignore very inaccurate fixes (worse than 250 m), unless nothing better has come in for a while.

export const HEARTBEAT_MS = 60_000;
export const MOVE_METERS = 150;
export const MIN_GAP_MS = 15_000;
export const MAX_ACCURACY_METERS = 250;

// Distance in meters between two { latitude, longitude } points (haversine formula).
export function distanceMeters(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// last: the last fix we SENT, or null.  next: the new fix.  Both look like
// { latitude, longitude, accuracy, timestamp } (timestamp in milliseconds).
export function shouldSend(last, next) {
  if (!last) return true; // rule 1
  const elapsed = next.timestamp - last.timestamp;
  if (elapsed < 0) return false; // an older fix arrived late; ignore it

  const accurate = next.accuracy == null || next.accuracy <= MAX_ACCURACY_METERS;
  if (!accurate) return elapsed >= 2 * HEARTBEAT_MS; // rule 4: a rough fix beats none after 2 minutes

  if (elapsed >= HEARTBEAT_MS) return true; // rule 2
  return elapsed >= MIN_GAP_MS && distanceMeters(last, next) >= MOVE_METERS; // rule 3
}
