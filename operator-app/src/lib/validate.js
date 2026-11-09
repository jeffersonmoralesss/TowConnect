// Form checks that mirror the database's own CHECK rules (supabase/migrations/..._init.sql).
// The database would reject bad data anyway; checking here first lets us show a clear message
// next to the right field instead of a raw database error.
// Each function returns an error message, or null when the value is fine.

export const PHONE_PATTERN = /^\+?[0-9 ().-]{7,20}$/; // same pattern as operators.phone

export function checkCompanyName(value) {
  const v = value.trim();
  if (v.length < 2) return 'Enter your company name.';
  if (v.length > 120) return 'Use 120 characters or fewer.';
  return null;
}

export function checkPhone(value) {
  const v = value.trim();
  if (!v) return 'Enter the number drivers should call.';
  if (!PHONE_PATTERN.test(v)) return 'Use digits only, for example (202) 555-0142.';
  return null;
}

export function checkLicense(value) {
  const v = value.trim();
  if (v.length < 2) return 'Enter your tow license number.';
  if (v.length > 60) return 'Use 60 characters or fewer.';
  return null;
}

export function checkUsdot(value) {
  const v = value.trim();
  if (!v) return null; // optional
  if (!/^\d{1,20}$/.test(v)) return 'USDOT numbers are digits only.';
  return null;
}

// Money fields are optional. Returns { value, error } so the caller gets the parsed number too.
export function parseMoney(text) {
  const v = text.trim().replace(/^\$/, '');
  if (!v) return { value: null, error: null };
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(v)) return { value: null, error: 'Use a dollar amount like 95 or 4.50.' };
  return { value: Number(v), error: null };
}

// The reverse of parseMoney, for showing a saved amount: 95 -> '$95', 4.5 -> '$4.50' (never '$4.5').
export function formatMoney(value) {
  const n = Number(value);
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export function checkRateNotes(value) {
  return value.trim().length > 280 ? 'Use 280 characters or fewer.' : null;
}

// Expiry dates are typed as YYYY-MM-DD so we don't need a date-picker library.
// `today` is passed in so tests can control it.
export function checkExpiryDate(value, today = new Date()) {
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'Use the format YYYY-MM-DD, for example 2027-06-30.';
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // new Date() quietly rolls 2027-02-31 into March; reject dates that changed.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return 'That date does not exist.';
  }
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (date.getTime() < todayUtc) return 'This document has already expired. Upload the current one.';
  return null;
}

export function checkEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? null : 'Enter a valid email address.';
}

export function checkPassword(value) {
  return value.length >= 8 ? null : 'Use at least 8 characters.';
}
