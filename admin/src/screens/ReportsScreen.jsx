// Reports drivers sent about operators. Newest first. Add notes, resolve, or suspend the operator.
import { useCallback, useEffect, useState } from 'react'
import { Banner, Body, Button, Card } from '../components/ui'
import { listReports, saveReportNotes, setOperatorStatus, setReportStatus } from '../lib/api'
import { Segmented } from './OperatorsScreen'

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'resolved', label: 'Resolved' },
]

// The same wording drivers picked from in the driver app's report form.
export const REASONS = {
  overcharged: 'Charged more than the posted rates',
  no_show: 'Agreed to come but never showed up',
  unsafe: 'Unsafe driving or behavior',
  unlicensed: 'License or truck details did not match',
  solicitation: 'Showed up or contacted me without being called',
  other: 'Something else',
}

const when = (iso) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function ReportsScreen({ onChange }) {
  const [filter, setFilter] = useState('open')
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setReports(await listReports(filter))
    } catch (err) {
      setError(err.message)
    }
  }, [filter])

  useEffect(() => {
    setReports(null)
    load()
  }, [load])

  return (
    <div className="stack">
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {reports === null && !error ? <p className="muted">Loading…</p> : null}
      {reports?.length === 0 ? <Body muted>No {filter} reports.</Body> : null}
      {reports?.map((r) => (
        <Report
          key={r.id}
          report={r}
          onDone={() => {
            load()
            onChange()
          }}
        />
      ))}
    </div>
  )
}

function Report({ report, onDone }) {
  const [notes, setNotes] = useState(report.admin_notes ?? '')
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const op = report.operators
  const open = report.status === 'open'

  const run = async (name, fn, after = onDone) => {
    setBusy(name)
    setMessage(null)
    try {
      await fn()
      after()
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="card-head">
        <h2 className="card-title">{REASONS[report.reason] ?? report.reason}</h2>
        <span className="muted small">{when(report.created_at)}</span>
      </div>
      <p className="body">
        About <strong>{op?.company_name ?? 'a deleted operator'}</strong>
        {op ? (
          <>
            {' '}
            · <a href={`tel:${op.phone.replace(/[^\d+]/g, '')}`}>{op.phone}</a> · {op.status}
          </>
        ) : null}
      </p>
      {report.details ? <blockquote className="quote">{report.details}</blockquote> : <Body muted>No details given.</Body>}
      <p className="small">
        Driver's contact: {report.reporter_contact ? <strong>{report.reporter_contact}</strong> : <span className="muted">none left</span>}
      </p>

      <div className="field">
        <label htmlFor={`notes-${report.id}`}>Your notes</label>
        <textarea
          id={`notes-${report.id}`}
          className="input"
          rows={3}
          maxLength={2000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What you found out, who you talked to"
        />
      </div>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="actions">
        <Button
          tone="secondary"
          label="Save notes"
          busy={busy === 'notes'}
          disabled={busy || notes === (report.admin_notes ?? '')}
          onClick={() => run('notes', () => saveReportNotes(report.id, notes), () => setMessage({ tone: 'good', text: 'Notes saved.' }))}
        />
        <Button
          label={open ? 'Resolve' : 'Reopen'}
          busy={busy === 'status'}
          disabled={busy}
          onClick={() =>
            run('status', async () => {
              if (notes !== (report.admin_notes ?? '')) await saveReportNotes(report.id, notes)
              await setReportStatus(report.id, open ? 'resolved' : 'open')
            })
          }
        />
        {op && op.status !== 'suspended' ? (
          <Button
            tone="danger"
            label="Suspend operator"
            busy={busy === 'suspend'}
            disabled={busy}
            onClick={() =>
              confirm(`Suspend ${op.company_name}? They disappear from the map right away.`) &&
              run('suspend', () => setOperatorStatus(op.id, 'suspended'))
            }
          />
        ) : null}
      </div>
    </Card>
  )
}
