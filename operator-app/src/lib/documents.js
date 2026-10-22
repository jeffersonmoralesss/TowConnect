// Works out what to tell the operator about their license and insurance. Kept as plain functions
// (no React, no network) so the rules are easy to read and are covered by tests/documents.test.mjs.

export const REQUIRED_KINDS = ['tow_license', 'insurance'];

export const KIND_LABELS = {
  tow_license: 'DC tow license',
  insurance: 'Insurance certificate',
};

const DAY_MS = 24 * 60 * 60 * 1000;
export const EXPIRING_SOON_DAYS = 30;

// Whole days from `today` until an expiry date ('YYYY-MM-DD'). Negative once it has passed.
export function daysUntil(expiresOn, today = new Date()) {
  if (!expiresOn) return Infinity;
  const [y, m, d] = expiresOn.split('-').map(Number);
  const end = Date.UTC(y, m - 1, d);
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((end - start) / DAY_MS);
}

// Matches the database rule in nearby_operators(): verified, and not expired (the expiry day itself still counts).
export function isValid(doc, today = new Date()) {
  return Boolean(doc?.verified) && daysUntil(doc.expires_on, today) >= 0;
}

// Summary for one kind of document. `docs` can be in any order.
//   current: the verified, unexpired record that keeps the operator on the map (if any)
//   pending: a newer upload still waiting for an admin (if any)
//   state:   what to show: 'missing' | 'review' | 'verified' | 'expiring' | 'expired'
export function summarize(docs, kind, today = new Date()) {
  const ofKind = docs
    .filter((d) => d.kind === kind)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)); // newest first

  const current = ofKind.find((d) => isValid(d, today)) ?? null;
  const pending = ofKind.find((d) => !d.verified && daysUntil(d.expires_on, today) >= 0) ?? null;

  let state;
  if (current) {
    state = daysUntil(current.expires_on, today) <= EXPIRING_SOON_DAYS ? 'expiring' : 'verified';
  } else if (pending) {
    state = 'review';
  } else if (ofKind.length) {
    state = 'expired';
  } else {
    state = 'missing';
  }
  return { state, current, pending };
}

// True when every required document has a verified, unexpired record, which is what drivers need to see you.
export function allRequiredValid(docs, today = new Date()) {
  return REQUIRED_KINDS.every((kind) => summarize(docs, kind, today).current);
}

// True when every required document has at least been uploaded (verified or waiting for review).
export function allRequiredUploaded(docs, today = new Date()) {
  return REQUIRED_KINDS.every((kind) => {
    const { state } = summarize(docs, kind, today);
    return state !== 'missing' && state !== 'expired';
  });
}
