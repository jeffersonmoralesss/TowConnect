// The automatic checks for an operator application. Plain functions (no React, no network) so the
// rules are easy to read and are covered by tests/checks.test.mjs.
//
// They do the looking-up for you, but they don't decide: an admin still opens the documents and
// calls the company. A check can only say what the data shows: 'ok', 'warn' (look closer) or
// 'fail' (approval is blocked until it's fixed).
import { daysUntil, EXPIRING_SOON_DAYS, KIND_LABELS } from '../shared/documents.js'
import { formatDate } from '../shared/dates.js'

// Words that every tow company shares, so they can't tell two companies apart.
const LEGAL_WORDS = new Set(['llc', 'inc', 'incorporated', 'co', 'corp', 'corporation', 'company', 'ltd', 'the', 'of', 'dc'])
const GENERIC_WORDS = new Set(['tow', 'towing', 'service', 'services', 'recovery', 'wrecker', 'wrecking', 'auto', 'and', 'roadside', 'transport', 'transportation', 'truck', 'trucks'])

// "Smith's Towing & Recovery, LLC" -> ['smiths', 'towing', 'and', 'recovery']
export function nameWords(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’.]/g, '') // "Joe's" -> "joes", "L.L.C." -> "llc"
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !LEGAL_WORDS.has(w))
}

// Same company? 'exact' when the names match once legal words and punctuation are ignored;
// 'close' when every distinctive word of one name is in the other ("Smith Towing" vs
// "Smith Towing and Recovery LLC"); null otherwise. Names made only of generic words ("Towing
// Service") never count as close, because they would match half the city.
export function compareNames(a, b) {
  const wa = nameWords(a)
  const wb = nameWords(b)
  if (!wa.length || !wb.length) return null
  if (wa.join(' ') === wb.join(' ')) return 'exact'
  const da = wa.filter((w) => !GENERIC_WORDS.has(w))
  const db = wb.filter((w) => !GENERIC_WORDS.has(w))
  if (!da.length || !db.length) return null
  const [short, long] = da.length <= db.length ? [da, new Set(db)] : [db, new Set(da)]
  return short.every((w) => long.has(w)) ? 'close' : null
}

// Directory listings that look like this company, best matches first.
export function findListingMatches(companyName, listings) {
  return listings
    .map((listing) => ({ listing, match: compareNames(companyName, listing.name) }))
    .filter((x) => x.match)
    .sort((x, y) => (x.match === y.match ? 0 : x.match === 'exact' ? -1 : 1))
}

const digits = (phone) => String(phone ?? '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')

// The newest uploaded document of one kind (a file, not just a typed date).
function newestUpload(docs, kind) {
  return docs
    .filter((d) => d.kind === kind && d.file_path)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
}

function documentCheck(docs, kind, today) {
  const label = KIND_LABELS[kind] ?? kind
  const doc = newestUpload(docs, kind)
  if (!doc) return { id: kind, status: 'fail', label: `${label} uploaded`, detail: 'Not uploaded yet.' }
  if (!doc.expires_on) return { id: kind, status: 'fail', label: `${label} uploaded`, detail: 'No expiry date was entered.' }
  const days = daysUntil(doc.expires_on, today)
  const when = formatDate(doc.expires_on)
  if (days < 0) return { id: kind, status: 'fail', label: `${label} current`, detail: `Expired ${when}.` }
  if (days <= EXPIRING_SOON_DAYS) {
    return { id: kind, status: 'warn', label: `${label} current`, detail: `Expires soon: ${when}. They'll drop off the map then unless they upload the new one.` }
  }
  return { id: kind, status: 'ok', label: `${label} current`, detail: `Expires ${when}. Check that the date on the document matches.` }
}

// Is there an active DC "Tow Truck Business" license under this name? Uses the DC license list
// already in the directory table (from the import script), so no extra network request is needed.
function dcLicenseCheck(operator, listings, today) {
  if (operator.jurisdiction !== 'DC') {
    return {
      id: 'license_record',
      status: 'warn',
      label: 'License record',
      detail: `${operator.jurisdiction} licenses aren't in our data. Check the license number on the ${operator.jurisdiction} license lookup.`,
    }
  }
  const dcListings = listings.filter((l) => l.source === 'dc_license')
  if (!dcListings.length) {
    return {
      id: 'license_record',
      status: 'warn',
      label: 'DC license record',
      detail: 'The DC license list hasn\'t been imported yet, so this can\'t be checked automatically. Look it up in SCOUT.',
    }
  }
  const matches = findListingMatches(operator.company_name, dcListings)
  const active = matches.find(({ listing }) => !listing.license_end_date || daysUntil(listing.license_end_date, today) >= 0)
  if (active) {
    const l = active.listing
    const until = l.license_end_date ? `, active through ${formatDate(l.license_end_date)}` : ''
    return {
      id: 'license_record',
      status: active.match === 'exact' ? 'ok' : 'warn',
      label: 'DC license record',
      detail:
        active.match === 'exact'
          ? `DC lists an active tow truck business license for "${l.name}"${until}.`
          : `Closest DC license: "${l.name}"${until}. The names differ a little, so make sure it's the same company.`,
    }
  }
  if (matches.length) {
    return {
      id: 'license_record',
      status: 'fail',
      label: 'DC license record',
      detail: `DC's record for "${matches[0].listing.name}" shows the license has ended.`,
    }
  }
  return {
    id: 'license_record',
    status: 'warn',
    label: 'DC license record',
    detail: 'No DC tow truck business license under this name in the last import. It may be under a different legal name. Look it up in SCOUT before approving.',
  }
}

// Someone already on Tow Connect with the same phone or license number is worth a second look:
// it can be a second account by mistake, or someone borrowing a real company's details.
function duplicateCheck(operator, others) {
  const phone = digits(operator.phone)
  const license = String(operator.license_number ?? '').trim().toLowerCase()
  const hits = []
  for (const o of others) {
    if (o.id === operator.id) continue
    if (phone && digits(o.phone) === phone) hits.push(`same phone as ${o.company_name}`)
    if (license && String(o.license_number ?? '').trim().toLowerCase() === license) hits.push(`same license number as ${o.company_name}`)
  }
  if (!hits.length) return { id: 'duplicates', status: 'ok', label: 'Not a duplicate', detail: 'No other operator uses this phone or license number.' }
  const text = hits.join('; ')
  return { id: 'duplicates', status: 'warn', label: 'Possible duplicate', detail: `${text[0].toUpperCase()}${text.slice(1)}. Find out why before approving.` }
}

function truckCheck(operator) {
  const n = operator.trucks?.length ?? 0
  return n
    ? { id: 'trucks', status: 'ok', label: 'Trucks listed', detail: `${n} truck${n === 1 ? '' : 's'}.` }
    : { id: 'trucks', status: 'warn', label: 'Trucks listed', detail: 'No trucks yet. Drivers won\'t know what kind of truck to expect.' }
}

// Every check for one operator, in the order they're shown.
// `others`: every other operator (id, company_name, phone, license_number).
// `listings`: directory listings (name, source, license_end_date, ...).
export function checkOperator(operator, { others = [], listings = [], today = new Date() } = {}) {
  const docs = operator.operator_documents ?? []
  return [
    documentCheck(docs, 'tow_license', today),
    documentCheck(docs, 'insurance', today),
    dcLicenseCheck(operator, listings, today),
    duplicateCheck(operator, others),
    truckCheck(operator),
  ]
}

// Approval is blocked by any failed check. Warnings need a human look, not a block.
export const hasBlocker = (checks) => checks.some((c) => c.status === 'fail')

// Links that help with the two things a person still has to do.
export const SCOUT_URL = 'https://scout.dcra.dc.gov/'
export const searchUrl = (name) =>
  `https://www.google.com/search?q=${encodeURIComponent(`"${name}" towing Washington DC phone`)}`
