// The second sign-in step: a 6-digit code from an authenticator app (Google Authenticator, Microsoft
// Authenticator, 1Password, or the Passwords app on iPhone). Free, and no text messages needed.
//
// mode 'enroll':    first time. Show a QR code to scan, then ask for a code to prove it worked.
// mode 'challenge': every sign-in after that. Just ask for the code.
// When the code is accepted, Supabase upgrades the session to "aal2" and App.jsx moves on by itself.
import { useEffect, useState } from 'react'
import { Banner, Body, Button, Field, Heading, Screen, Title } from '../components/ui'
import { signOut, startEnroll, verifiedFactor, verifyCode } from '../lib/api'

export default function TwoStepScreen({ mode, email }) {
  const [setup, setSetup] = useState(null) // { factorId, qrCode, secret } when enrolling
  const [factorId, setFactorId] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (mode === 'enroll') {
          const s = await startEnroll()
          if (!cancelled) {
            setSetup(s)
            setFactorId(s.factorId)
          }
        } else {
          const f = await verifiedFactor()
          if (!cancelled) setFactorId(f?.id ?? null)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode])

  const submit = async (event) => {
    event.preventDefault()
    const clean = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(clean)) {
      setError('Enter the 6-digit code from your authenticator app.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await verifyCode(factorId, clean)
    } catch {
      setError('That code didn\'t work. Codes change every 30 seconds; type the one showing now.')
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Title>{mode === 'enroll' ? 'Set up two-step sign-in' : 'Enter your code'}</Title>
      {mode === 'enroll' ? (
        <>
          <Body>
            Admins can see every operator's documents and approve who appears to drivers, so a password alone isn't enough. This
            takes a minute, once.
          </Body>
          <ol className="steps">
            <li>
              On your phone, open an authenticator app. The <strong>Passwords</strong> app on iPhone works, or Google Authenticator.
            </li>
            <li>Add a new code and scan this QR code with it.</li>
            <li>Type the 6-digit code it shows.</li>
          </ol>
          {setup ? (
            <div className="qr-box">
              <img src={setup.qrCode} alt="QR code for your authenticator app" width="200" height="200" />
              <details>
                <summary>Can't scan? Type this key instead</summary>
                <p className="code">{setup.secret}</p>
              </details>
            </div>
          ) : !error ? (
            <p className="muted">Preparing your QR code…</p>
          ) : null}
        </>
      ) : (
        <Body>Open your authenticator app and type the 6-digit code for Tow Connect ({email}).</Body>
      )}

      {error ? <Banner tone="bad">{error}</Banner> : null}

      <form onSubmit={submit} noValidate className="stack">
        <Field
          label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          autoFocus
        />
        <Button type="submit" label="Continue" busy={busy} disabled={!factorId} />
      </form>
      <Heading>Lost your phone?</Heading>
      <Body muted>
        The project owner can remove the old authenticator with one line in the Supabase SQL Editor (README: "Admin panel"). Then
        you sign in and set it up again here.
      </Body>
      <Button tone="secondary" label="Sign out" onClick={signOut} />
    </Screen>
  )
}
