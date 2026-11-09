// Operators: review new applications, and manage approved and suspended operators.
//
// For an application the panel does the looking-up (documents present and current, DC license
// record, duplicates) and shows the result as a checklist. Two things stay with a person, as
// tick boxes that must be ticked before Approve works: opening the documents, and calling the
// company's public number to confirm the applicant really works there.
import { useCallback, useEffect, useState } from 'react'
import { Banner, Body, Button, Card } from '../components/ui'
import {
  approveOperator,
  documentLink,
  listListingNames,
  listOperatorKeys,
  listOperators,
  setDocumentVerified,
  setOperatorStatus,
} from '../lib/api'
import { checkOperator, findListingMatches, hasBlocker, SCOUT_URL, searchUrl } from '../lib/checks'
import { KIND_LABELS, summarize } from '../shared/documents'
import { formatDate } from '../shared/dates'

const FILTERS = [
  { id: 'pending', label: 'Waiting for review' },
  { id: 'approved', label: 'Approved' },
  { id: 'suspended', label: 'Suspended' },
]

export default function OperatorsScreen({ onChange }) {
  const [filter, setFilter] = useState('pending')
  const [operators, setOperators] = useState(null)
  const [context, setContext] = useState({ others: [], listings: [] })
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [ops, others, listings] = await Promise.all([listOperators(filter), listOperatorKeys(), listListingNames()])
      setOperators(ops)
      setContext({ others, listings })
    } catch (err) {
      setError(err.message)
    }
  }, [filter])

  useEffect(() => {
    setOperators(null)
    load()
  }, [load])

  const changed = () => {
    load()
    onChange()
  }

  return (
    <div className="stack">
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {operators === null && !error ? <p className="muted">Loading…</p> : null}
      {operators?.length === 0 ? (
        <Body muted>{filter === 'pending' ? 'No applications waiting. ' : ''}Nothing here right now.</Body>
      ) : null}
      {operators?.map((op) =>
        filter === 'pending' ? (
          <Application key={op.id} operator={op} context={context} onDone={changed} />
        ) : (
          <ExistingOperator key={op.id} operator={op} onDone={changed} />
        ),
      )}
    </div>
  )
}

export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          className={o.id === value ? 'seg seg-on' : 'seg'}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Opens a private document in a new tab. The tab is opened first, before the link is fetched,
// because browsers (Safari especially) block tabs opened after waiting for the network.
async function openDocument(path) {
  const tab = window.open('about:blank', '_blank')
  try {
    const url = await documentLink(path)
    if (tab) tab.location.href = url
    else window.location.href = url
  } catch (err) {
    tab?.close()
    alert(`Couldn't open the document: ${err.message}`)
  }
}

function OperatorFacts({ operator }) {
  const rates = [
    operator.hookup_fee != null ? `$${Number(operator.hookup_fee).toFixed(2)} hookup` : null,
    operator.per_mile_rate != null ? `$${Number(operator.per_mile_rate).toFixed(2)}/mile` : null,
  ].filter(Boolean)
  return (
    <dl className="facts">
      <Fact label="Phone they gave">
        <a href={`tel:${operator.phone.replace(/[^\d+]/g, '')}`}>{operator.phone}</a>
      </Fact>
      {operator.contact_name ? <Fact label="Contact">{operator.contact_name}</Fact> : null}
      <Fact label="Tow license">
        {operator.license_number} ({operator.jurisdiction})
      </Fact>
      {operator.usdot_number ? <Fact label="USDOT">{operator.usdot_number}</Fact> : null}
      <Fact label="Trucks">
        {operator.trucks?.length ? operator.trucks.map((t) => `${t.type.replace('_', ' ')}${t.plate ? ` (${t.plate})` : ''}`).join(', ') : 'None'}
      </Fact>
      <Fact label="Services">{operator.services?.length ? operator.services.join(', ') : 'None listed'}</Fact>
      <Fact label="Rates">{rates.length ? rates.join(', ') : 'Not listed'}{operator.rate_notes ? `. ${operator.rate_notes}` : ''}</Fact>
    </dl>
  )
}

function Fact({ label, children }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function DocumentRows({ docs, onVerify }) {
  const sorted = [...docs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  if (!sorted.length) return <Body muted>No documents uploaded.</Body>
  return (
    <ul className="doc-list">
      {sorted.map((d) => (
        <li key={d.id}>
          <div>
            <strong>{KIND_LABELS[d.kind] ?? d.kind}</strong>
            <span className="muted small">
              {' '}
              · {d.expires_on ? `expires ${formatDate(d.expires_on)}` : 'no expiry date'} · {d.verified ? 'verified' : 'not verified'}
            </span>
          </div>
          <div className="doc-actions">
            {d.file_path ? <Button tone="secondary" label="Open" onClick={() => openDocument(d.file_path)} /> : <span className="muted small">No file</span>}
            {onVerify && d.file_path ? (
              <Button tone="secondary" label={d.verified ? 'Unverify' : 'Verify'} onClick={() => onVerify(d)} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

const ICON = { ok: '✓', warn: '!', fail: '✕' }

function Checklist({ checks }) {
  return (
    <ul className="auto-checks">
      {checks.map((c) => (
        <li key={c.id} className={`check check-${c.status}`}>
          <span className="check-icon" aria-hidden="true">
            {ICON[c.status]}
          </span>
          <span>
            <strong>{c.label}</strong>
            <span className="visually-hidden"> ({c.status === 'ok' ? 'passed' : c.status === 'warn' ? 'needs a look' : 'failed'})</span>
            <br />
            <span className="small">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function Application({ operator, context, onDone }) {
  const checks = checkOperator(operator, context)
  const blocked = hasBlocker(checks)
  const matches = findListingMatches(
    operator.company_name,
    context.listings.filter((l) => !l.operator_id),
  )
  const [listingId, setListingId] = useState(matches[0]?.match === 'exact' ? matches[0].listing.id : '')
  const [sawDocs, setSawDocs] = useState(false)
  const [called, setCalled] = useState(false)
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)

  const approve = async () => {
    setBusy('approve')
    setResult(null)
    try {
      const r = await approveOperator(operator.id, listingId || null)
      setResult({ tone: r.ok ? 'good' : 'bad', text: r.message })
      if (r.ok) setTimeout(onDone, 1200)
    } catch (err) {
      setResult({ tone: 'bad', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    if (!confirm(`Turn down ${operator.company_name}? They'll see that their account is suspended. Call them to explain why.`)) return
    setBusy('reject')
    try {
      await setOperatorStatus(operator.id, 'suspended')
      onDone()
    } catch (err) {
      setResult({ tone: 'bad', text: err.message })
      setBusy(null)
    }
  }

  const id = `app-${operator.id}`
  return (
    <Card className="review">
      <div className="card-head">
        <h2 className="card-title" id={id}>
          {operator.company_name}
        </h2>
        <span className="muted small">Applied {formatDate(operator.created_at.slice(0, 10))}</span>
      </div>
      <OperatorFacts operator={operator} />

      <h3 className="sub">Documents</h3>
      <DocumentRows docs={operator.operator_documents ?? []} />

      <h3 className="sub">Automatic checks</h3>
      <Checklist checks={checks} />
      <p className="small">
        <a href={SCOUT_URL} target="_blank" rel="noreferrer">
          Look up the license in DC's SCOUT
        </a>
        {' · '}
        <a href={searchUrl(operator.company_name)} target="_blank" rel="noreferrer">
          Find the company's public phone number
        </a>
      </p>

      {matches.length ? (
        <div className="field">
          <label htmlFor={`${id}-listing`}>Same company in the directory?</label>
          <select id={`${id}-listing`} className="input" value={listingId} onChange={(e) => setListingId(e.target.value)}>
            <option value="">No, it's a different company</option>
            {matches.map(({ listing, match }) => (
              <option key={listing.id} value={listing.id}>
                {listing.name} ({match === 'exact' ? 'same name' : 'similar name'})
              </option>
            ))}
          </select>
          <span className="field-hint">If you pick one, that listing hides once they're approved, so drivers don't see the company twice.</span>
        </div>
      ) : null}

      <h3 className="sub">Your checks</h3>
      <label className="toggle-row">
        <input type="checkbox" checked={sawDocs} onChange={(e) => setSawDocs(e.target.checked)} />
        I opened the documents. They're real, in this company's name, and the dates match.
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={called} onChange={(e) => setCalled(e.target.checked)} />
        I called the company's public number (not only the one they typed) and confirmed this person works there.
      </label>

      {result ? <Banner tone={result.tone}>{result.text}</Banner> : null}
      {blocked ? <Banner tone="bad">Approval is blocked until the failed checks (✕) are fixed. Usually the operator needs to upload a current document.</Banner> : null}

      <div className="actions">
        <Button label="Approve" onClick={approve} busy={busy === 'approve'} disabled={blocked || !sawDocs || !called || busy} />
        <Button tone="secondary" label="Turn down" onClick={reject} busy={busy === 'reject'} disabled={busy} />
      </div>
    </Card>
  )
}

function ExistingOperator({ operator, onDone }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const docs = operator.operator_documents ?? []
  const license = summarize(docs, 'tow_license')
  const insurance = summarize(docs, 'insurance')
  const needsReview = docs.some((d) => !d.verified && d.file_path)
  const suspended = operator.status === 'suspended'

  const run = async (fn) => {
    setBusy(true)
    setMessage(null)
    try {
      const r = await fn()
      if (r && r.ok === false) setMessage({ tone: 'bad', text: r.message })
      else onDone()
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const stateText = { verified: 'current', expiring: 'expiring soon', expired: 'expired', review: 'new upload to check', missing: 'missing' }

  return (
    <Card>
      <div className="card-head">
        <h2 className="card-title">{operator.company_name}</h2>
        <span className={operator.is_available ? 'pill pill-live' : 'pill'}>{suspended ? 'Suspended' : operator.is_available ? 'Available now' : 'Offline'}</span>
      </div>
      <OperatorFacts operator={operator} />
      <p className="small">
        License: <strong>{stateText[license.state]}</strong> · Insurance: <strong>{stateText[insurance.state]}</strong>
      </p>
      {needsReview && !suspended ? <Banner>They uploaded a new document. Open it and Verify it to keep them on the map.</Banner> : null}
      <details>
        <summary>Documents</summary>
        <DocumentRows docs={docs} onVerify={(d) => run(() => setDocumentVerified(d.id, !d.verified))} />
      </details>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="actions">
        {suspended ? (
          <Button label="Reinstate" busy={busy} onClick={() => run(() => approveOperator(operator.id))} />
        ) : (
          <Button
            tone="danger"
            label="Suspend"
            busy={busy}
            onClick={() => confirm(`Suspend ${operator.company_name}? They disappear from the map right away.`) && run(() => setOperatorStatus(operator.id, 'suspended'))}
          />
        )}
      </div>
    </Card>
  )
}
