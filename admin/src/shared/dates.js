// Date helpers. Dates from the database arrive as 'YYYY-MM-DD' text.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// '2027-06-30' -> 'Jun 30, 2027'. Built by hand from the text so the phone's time zone can never
// shift it to the day before (which `new Date('2027-06-30')` can do west of Greenwich).
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

// Today plus n days, as 'YYYY-MM-DD' in the phone's local time.
export function addDays(n, from = new Date()) {
  const t = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  return `${t.getFullYear()}-${mm}-${dd}`;
}

// How long ago a moment was, in short words: 'just now', '3 min ago', '2 h ago'.
export function timeAgo(ms, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}
