// The approved operator's main page: the Available switch, auto check-in, and what drivers see.
// Mirrors the Android app's HomeScreen, with two web-only additions: "Keep screen on" for mounted
// phones, and the auto check-in section for when this page isn't on screen.
import { useCallback, useEffect, useState } from 'react'
import CheckinSection from '../components/CheckinSection'
import DocumentsSection from '../components/DocumentsSection'
import TrucksSection from '../components/TrucksSection'
import { Banner, Body, Button, Card, Heading, Loading, Screen, Title } from '../components/ui'
import { setAvailable } from '../lib/api'
import { useOperatorData } from '../lib/useOperatorData'
import { canKeepScreenOn, setKeepScreenOn, startSharing, stopSharing, subscribe } from '../location/sharing'
import { timeAgo } from '../shared/dates'
import { allRequiredValid, REQUIRED_KINDS, summarize } from '../shared/documents'
import { formatMoney } from '../shared/validate'

export default function HomeScreen({ operator, userId, onOperatorChanged, onEditProfile, onSignOut }) {
  const { trucks, documents, loading, reload } = useOperatorData(operator.id)
  const [sharing, setSharing] = useState({ sharing: false, lastSentAt: null, lastError: null, screenAwake: false })
  const [keepOn, setKeepOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [, tick] = useState(0) // re-render every 15 s so "x min ago" stays current
  const available = operator.is_available

  useEffect(() => subscribe(setSharing), [])
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15000)
    return () => clearInterval(t)
  }, [])

  const goAvailable = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      // Location first, then the switch: a truck is never listed without a position.
      await startSharing(operator.id)
      const stored = await setAvailable(operator.id, true)
      if (!stored) {
        stopSharing()
        throw new Error('Your account is not approved right now. Check your status.')
      }
      onOperatorChanged({ ...operator, is_available: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }, [operator, onOperatorChanged])

  const goOffline = async () => {
    setBusy(true)
    setError(null)
    try {
      stopSharing() // stop sending first, then flip the switch
      setKeepOn(false)
      await setAvailable(operator.id, false)
      onOperatorChanged({ ...operator, is_available: false })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  // Opening the page while already Available (for example from the home screen icon) resumes sharing.
  useEffect(() => {
    if (available && !sharing.sharing) {
      startSharing(operator.id).catch((err) => setError(err.message))
    }
    // Only when the page first opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleKeepOn = async (on) => {
    setKeepOn(on)
    await setKeepScreenOn(on)
  }

  if (loading) return <Loading />

  const docsOk = allRequiredValid(documents)
  const expiring = REQUIRED_KINDS.map((k) => summarize(documents, k)).filter((d) => d.state === 'expiring')
  const rates =
    [
      operator.hookup_fee != null ? `${formatMoney(operator.hookup_fee)} hookup` : null,
      operator.per_mile_rate != null ? `${formatMoney(operator.per_mile_rate)}/mi` : null,
    ]
      .filter(Boolean)
      .join(' + ') || 'No rates posted. Drivers trust posted rates more.'

  return (
    <Screen>
      <Title>{operator.company_name}</Title>

      <Card className={available ? 'card-live' : ''}>
        <p className="status-text">{available ? 'You are Available' : 'You are offline'}</p>
        <Body muted>
          {available
            ? 'Drivers near you can see your approximate area and call you.'
            : 'Drivers cannot see you. Go Available when you can take a job.'}
        </Body>

        {available ? (
          <Button tone="secondary" label="Go offline" onClick={goOffline} busy={busy} />
        ) : (
          <Button tone="beacon" label="Go Available" onClick={goAvailable} busy={busy} disabled={!docsOk} />
        )}

        {available && sharing.lastSentAt ? <Body muted>Location last sent {timeAgo(sharing.lastSentAt)} from this page</Body> : null}
        {available && sharing.lastError ? <Banner tone="notice">{sharing.lastError}</Banner> : null}
        {available && canKeepScreenOn ? (
          <label className="toggle-row">
            <input type="checkbox" checked={keepOn} onChange={(e) => toggleKeepOn(e.target.checked)} />
            Keep screen on while this is open (for a dash mount)
          </label>
        ) : null}
        {available ? (
          <Body muted>
            When you switch to another app or lock your phone, this page pauses. Your last location stays on the map for up to
            30 minutes, and auto check-in below keeps it fresh.
          </Body>
        ) : null}
      </Card>

      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!docsOk ? (
        <Banner tone="bad">
          Your license or insurance has expired or is still being reviewed, so drivers can't see you. Upload the current document
          below.
        </Banner>
      ) : null}
      {expiring.length ? (
        <Banner tone="notice">A document expires soon. Upload the renewed copy now so you aren't hidden on the expiry day.</Banner>
      ) : null}

      <CheckinSection operatorId={operator.id} />

      <Heading>What drivers see</Heading>
      <Card>
        <Body>{operator.phone}</Body>
        <Body muted>{rates}</Body>
        <Body muted>{operator.services.join(', ')}</Body>
        <Button tone="secondary" label="Edit company and rates" onClick={onEditProfile} />
      </Card>

      <TrucksSection operatorId={operator.id} trucks={trucks} onChanged={reload} />
      <DocumentsSection operatorId={operator.id} userId={userId} documents={documents} onChanged={reload} />

      <div>
        <Button tone="link" label="Sign out" onClick={onSignOut} />
      </div>
    </Screen>
  )
}
