// Upload and track the tow license and insurance. Port of the Android app's DocumentsSection.
// On iPhone, the file picker offers Take Photo, Photo Library or Files, so a photo of the paper works.
import { useRef, useState } from 'react'
import { uploadDocument } from '../lib/api'
import { addDays, formatDate } from '../shared/dates'
import { daysUntil, KIND_LABELS, REQUIRED_KINDS, summarize } from '../shared/documents'
import { checkExpiryDate } from '../shared/validate'
import { Banner, Body, Button, Card, Field, Heading } from './ui'

const MAX_BYTES = 5 * 1024 * 1024 // 5 MB keeps us well inside the free 1 GB of storage

const STATE_TEXT = {
  missing: { text: 'Not uploaded yet', className: 'state-bad' },
  review: { text: 'Waiting for review', className: 'state-muted' },
  verified: { text: 'Verified', className: 'state-good' },
  expiring: { text: 'Verified, expires soon', className: 'state-bad' },
  expired: { text: 'Expired. Upload the current one.', className: 'state-bad' },
}

export default function DocumentsSection({ operatorId, userId, documents, onChanged }) {
  return (
    <>
      <Heading>Documents</Heading>
      <Body muted>A photo or PDF is fine. Only you and Tow Connect reviewers can see these files.</Body>
      {REQUIRED_KINDS.map((kind) => (
        <DocumentCard key={kind} kind={kind} operatorId={operatorId} userId={userId} documents={documents} onChanged={onChanged} />
      ))}
    </>
  )
}

function DocumentCard({ kind, operatorId, userId, documents, onChanged }) {
  const { state, current, pending } = summarize(documents, kind)
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onPicked = (event) => {
    const picked = event.target.files?.[0]
    event.target.value = '' // so picking the same file again still fires onChange
    if (!picked) return
    if (picked.size > MAX_BYTES) {
      setError('That file is over 5 MB. Try a photo or a smaller PDF.')
      return
    }
    setError(null)
    setFile(picked)
  }

  const upload = async () => {
    const dateError = checkExpiryDate(expiresOn)
    if (dateError) {
      setError(dateError)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await uploadDocument({ operatorId, userId, kind, file, expiresOn: expiresOn.trim() })
      setFile(null)
      setExpiresOn('')
      onChanged()
    } catch (err) {
      setError(`Upload failed: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }

  const status = STATE_TEXT[state]
  const shown = current ?? pending
  const days = current ? daysUntil(current.expires_on) : null

  return (
    <Card>
      <p className="card-title">{KIND_LABELS[kind]}</p>
      <p className={status.className}>{status.text}</p>
      {shown?.expires_on ? (
        <Body muted>
          Expires {formatDate(shown.expires_on)}
          {days != null && days <= 30 ? ` (in ${days} days)` : ''}
        </Body>
      ) : null}
      {current && pending ? <Body muted>Your newer upload is waiting for review. You stay visible meanwhile.</Body> : null}

      {/* The real file input is hidden; our big button opens it. */}
      <input ref={inputRef} type="file" accept="application/pdf,image/*" hidden onChange={onPicked} />

      {file ? (
        <>
          <Body>Selected: {file.name}</Body>
          <Field
            label="Expiry date on this document"
            value={expiresOn}
            onChange={(e) => setExpiresOn(e.target.value)}
            placeholder={`For example ${addDays(365)}`}
            hint="Format: YYYY-MM-DD"
            inputMode="numeric"
          />
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button label="Upload" onClick={upload} busy={busy} />
          <Button tone="link" label="Choose a different file" onClick={() => inputRef.current?.click()} />
        </>
      ) : (
        <>
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button
            tone={state === 'missing' || state === 'expired' ? 'primary' : 'secondary'}
            label={state === 'missing' ? 'Choose file' : 'Upload a newer copy'}
            onClick={() => inputRef.current?.click()}
          />
        </>
      )}
    </Card>
  )
}
