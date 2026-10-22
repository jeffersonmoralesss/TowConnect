import { useState } from 'react'
import { submitReport } from '../lib/api.js'

const REASONS = [
  { value: 'overcharged', label: 'Charged more than the posted rates' },
  { value: 'no_show', label: 'Agreed to come but never showed up' },
  { value: 'unsafe', label: 'Unsafe driving or behavior' },
  { value: 'unlicensed', label: 'License or truck details did not match' },
  { value: 'solicitation', label: 'Showed up or contacted me without being called' },
  { value: 'other', label: 'Something else' },
]

export default function ReportForm({ operator, onClose }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [contact, setContact] = useState('')
  const [state, setState] = useState({ status: 'idle', error: null })

  const send = async (event) => {
    event.preventDefault()
    if (!reason) {
      setState({ status: 'idle', error: 'Choose what went wrong.' })
      return
    }
    setState({ status: 'sending', error: null })
    try {
      await submitReport({ operatorId: operator.id, reason, details: details.trim(), contact: contact.trim() })
      setState({ status: 'sent', error: null })
    } catch (err) {
      setState({ status: 'idle', error: `The report did not send: ${err.message}` })
    }
  }

  if (state.status === 'sent') {
    return (
      <div className="report-done" role="status">
        <h3>Report sent</h3>
        <p>An admin reviews every report and can remove operators who break the rules.</p>
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
    )
  }

  return (
    <form className="report-form" onSubmit={send}>
      <h3>Report this operator</h3>
      <fieldset>
        <legend>What went wrong?</legend>
        {REASONS.map((r) => (
          <label key={r.value} className="radio-row">
            <input type="radio" name="reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} />
            <span>{r.label}</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Details (optional)</span>
        <textarea rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <label className="field">
        <span>Phone or email, if you want a reply (optional)</span>
        <input type="text" maxLength={200} autoComplete="email" value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      {state.error && (
        <p className="form-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={state.status === 'sending'}>
          {state.status === 'sending' ? 'Sending report' : 'Send report'}
        </button>
        <button type="button" className="link-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  )
}
