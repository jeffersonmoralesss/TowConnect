// Auto check-in setup for iPhones. The operator makes a personal code here, pastes it into the
// "Tow Connect Check-in" shortcut once, and adds automations so the shortcut runs whenever they open
// Maps or their dispatch app. Each run sends their location through checkin() in the database.
import { useEffect, useState } from 'react'
import { createCheckinCode, deleteCheckinCode, getCheckinStatus } from '../lib/api'
import { timeAgo } from '../shared/dates'
import { Banner, Body, Button, Card, Heading } from './ui'

const SHORTCUT_URL = import.meta.env.VITE_CHECKIN_SHORTCUT_URL

export default function CheckinSection({ operatorId }) {
  const [status, setStatus] = useState(undefined) // undefined = loading, null = not set up
  const [code, setCode] = useState(null) // only right after making one; never stored
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const load = () =>
    getCheckinStatus(operatorId)
      .then(setStatus)
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorId])

  const makeCode = async () => {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      setCode(await createCheckinCode())
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      await deleteCheckinCode()
      setCode(null)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setError('Copy did not work. Press and hold the code to select it, then tap Copy.')
    }
  }

  if (status === undefined && !error) return null

  return (
    <>
      <Heading>Auto check-in (iPhone)</Heading>
      <Card>
        {code ? (
          <>
            <Body>
              <strong>Your check-in code.</strong> Copy it now: for your security it's shown only once. If you lose it, make a
              new one.
            </Body>
            <p className="code" aria-label="Check-in code">
              {code}
            </p>
            <Button label={copied ? 'Copied' : 'Copy code'} onClick={copy} />
            <SetupSteps />
            <Button tone="link" label="I'm done" onClick={() => setCode(null)} />
          </>
        ) : status ? (
          <>
            <p className="state-good">Auto check-in is set up</p>
            <Body muted>
              {status.last_used_at
                ? `Last check-in from your shortcut: ${timeAgo(new Date(status.last_used_at).getTime())}.`
                : 'Your shortcut hasn’t checked in yet. Open Maps or your dispatch app to test it.'}
            </Body>
            <Button tone="secondary" label="Make a new code" onClick={makeCode} busy={busy} />
            <Body muted>A new code stops the old one from working. Paste the new one into the shortcut.</Body>
            <Button tone="link" label="Turn off auto check-in" onClick={turnOff} />
          </>
        ) : (
          <>
            <Body>
              iPhones pause this page when you switch to another app. Auto check-in fixes that: every time you open Maps or
              your dispatch app, your iPhone quietly sends your location to Tow Connect.
            </Body>
            <Body muted>It only updates where you are. It never turns you Available; you still do that here.</Body>
            <Button label="Set up auto check-in" onClick={makeCode} busy={busy} />
          </>
        )}
        {error ? <Banner tone="bad">{error}</Banner> : null}
      </Card>
    </>
  )
}

// The operator-facing instructions. The README has the developer steps for building the shortcut itself.
function SetupSteps() {
  return (
    <ol className="steps">
      <li>
        {SHORTCUT_URL ? (
          <a href={SHORTCUT_URL} target="_blank" rel="noreferrer">
            Get the Tow Connect Check-in shortcut
          </a>
        ) : (
          <span>Get the Tow Connect Check-in shortcut (link coming soon from Tow Connect)</span>
        )}
        , tap <strong>Add Shortcut</strong>, and paste your code when it asks.
      </li>
      <li>
        Open the <strong>Shortcuts</strong> app and tap the new shortcut once. When iPhone asks, choose <strong>Allow</strong>{' '}
        for your location and <strong>Always Allow</strong> for connecting to Tow Connect. This lets it run on its own later.
      </li>
      <li>
        Go to the <strong>Automation</strong> tab, tap <strong>+</strong>, choose <strong>App</strong>, select{' '}
        <strong>Google Maps</strong> (or Apple Maps) and your <strong>dispatch app</strong>, keep <strong>Is Opened</strong>,
        choose <strong>Run Immediately</strong>, then pick <strong>Tow Connect Check-in</strong>.
      </li>
      <li>
        Optional: add another automation with <strong>Bluetooth</strong> (your truck) or <strong>CarPlay</strong>, so it also
        checks in when you get in the truck.
      </li>
      <li>Tap Go Available here, then open Maps. Come back: "Last check-in" should say just now.</li>
    </ol>
  )
}
