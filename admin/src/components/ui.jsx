// Shared building blocks, the web versions of operator-app/src/components/ui.js.
// Same names and props as the Android app, so the screens read almost the same in both.

export function Screen({ children }) {
  return <main className="page">{children}</main>
}

export function Title({ children }) {
  return <h1 className="title">{children}</h1>
}

export function Heading({ children }) {
  return <h2 className="heading">{children}</h2>
}

export function Body({ children, muted }) {
  return <p className={muted ? 'body muted' : 'body'}>{children}</p>
}

// tone: 'primary' | 'beacon' | 'secondary' | 'danger' | 'link'
export function Button({ label, onClick, tone = 'primary', busy, disabled, type = 'button' }) {
  return (
    <button type={type} className={`btn btn-${tone}`} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
      {busy ? 'Working…' : label}
    </button>
  )
}

// A labeled input with its own error line. Pass `multiline` for a textarea.
export function Field({ label, error, hint, multiline, id, ...inputProps }) {
  const fieldId = id || `f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const describedBy = error || hint ? `${fieldId}-note` : undefined
  const Input = multiline ? 'textarea' : 'input'
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <Input
        id={fieldId}
        className={error ? 'input input-error' : 'input'}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        rows={multiline ? 3 : undefined}
        {...inputProps}
      />
      {error ? (
        <span id={describedBy} className="field-error">
          {error}
        </span>
      ) : hint ? (
        <span id={describedBy} className="field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

export function Chip({ label, selected, onClick }) {
  return (
    <button type="button" className={selected ? 'chip chip-on' : 'chip'} aria-pressed={selected} onClick={onClick}>
      {label}
    </button>
  )
}

export function Card({ children, className = '' }) {
  return <section className={`card ${className}`}>{children}</section>
}

// tone: 'notice' | 'good' | 'bad'
export function Banner({ children, tone = 'notice' }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}

export function Loading() {
  return (
    <main className="page center" role="status">
      <p className="muted">Loading</p>
    </main>
  )
}
