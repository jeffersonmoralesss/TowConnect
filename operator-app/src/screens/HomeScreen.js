// The approved operator's main screen: one big Available switch, plus what drivers see (FR-O4, FR-O7).
import { useCallback, useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import DocumentsSection from '../components/DocumentsSection';
import TrucksSection from '../components/TrucksSection';
import { Banner, Body, Button, Card, Heading, Loading, Screen, Title } from '../components/ui';
import { setAvailable } from '../lib/api';
import { timeAgo } from '../lib/dates';
import { allRequiredValid, REQUIRED_KINDS, summarize } from '../lib/documents';
import { useOperatorData } from '../lib/useOperatorData';
import { sharingStatus } from '../location/report';
import { currentMode, isExpoGo, SharingError, startSharing, stopSharing } from '../location/tracking';
import { colors } from '../theme';

export default function HomeScreen({ operator, userId, onOperatorChanged, onEditProfile, onSignOut }) {
  const { trucks, documents, loading, reload } = useOperatorData(operator.id);
  const [mode, setMode] = useState(null); // 'background' | 'foreground' | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(sharingStatus());

  const available = operator.is_available;

  const goAvailable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const started = await startSharing(operator.id);
      // Only after location works do we tell the database we're Available, so a truck is never
      // listed without a position.
      const stored = await setAvailable(operator.id, true);
      if (!stored) {
        // The database refused (for example the account was paused a moment ago).
        await stopSharing();
        throw new SharingError('Your account is not approved right now. Check your status.');
      }
      setMode(started);
      onOperatorChanged({ ...operator, is_available: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setStatus(sharingStatus());
    }
  }, [operator, onOperatorChanged]);

  const goOffline = async () => {
    setBusy(true);
    setError(null);
    try {
      // Stop sending first, then flip the switch, so no position is sent after going offline.
      await stopSharing();
      await setAvailable(operator.id, false);
      setMode(null);
      onOperatorChanged({ ...operator, is_available: false });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // When the screen opens: if the database says we're Available but nothing is sharing
  // (the phone restarted, or the app was reloaded), restart sharing so the switch tells the truth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const running = await currentMode();
      if (cancelled) return;
      setMode(running);
      if (available && !running) goAvailable();
    })();
    return () => {
      cancelled = true;
    };
    // Run once when the screen opens, not every time `available` changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh "last sent" every 5 seconds, and when the app comes back to the screen.
  useEffect(() => {
    const timer = setInterval(() => setStatus(sharingStatus()), 5000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        setStatus(sharingStatus());
        currentMode().then(setMode);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  if (loading) return <Loading />;

  const docsOk = allRequiredValid(documents);
  const expiring = REQUIRED_KINDS.map((k) => summarize(documents, k)).filter((d) => d.state === 'expiring');

  return (
    <Screen>
      <Title>{operator.company_name}</Title>

      <Card style={{ borderWidth: 2, borderColor: available ? colors.beacon : colors.line }}>
        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }} accessibilityRole="header">
          {available ? 'You are Available' : 'You are offline'}
        </Text>
        <Body muted>
          {available
            ? 'Drivers near you can see your approximate area and call you.'
            : 'Drivers cannot see you. Go Available when you can take a job.'}
        </Body>

        {available ? (
          <Button tone="secondary" label="Go offline" onPress={goOffline} busy={busy} />
        ) : (
          <Button tone="beacon" label="Go Available" onPress={goAvailable} busy={busy} disabled={!docsOk} />
        )}

        {available && status.lastSentAt ? <Body muted>Location last sent {timeAgo(status.lastSentAt)}</Body> : null}
        {available && status.lastError ? (
          <Banner tone="notice">The last location update didn't go through (weak signal?). It retries automatically.</Banner>
        ) : null}
        {available && mode === 'foreground' ? (
          <Banner tone="notice">
            {isExpoGo
              ? 'Test mode (Expo Go): your location is only shared while this app is open on screen.'
              : 'Your location is only shared while this app is open. To keep sharing while you use Google Maps, allow location "All the time" in Settings, then go offline and Available again.'}
          </Banner>
        ) : null}
      </Card>

      {error ? <Banner tone="bad">{error}</Banner> : null}
      {!docsOk ? (
        <Banner tone="bad">
          Your license or insurance has expired or is still being reviewed, so drivers can't see you. Upload the current
          document below.
        </Banner>
      ) : null}
      {expiring.length ? (
        <Banner tone="notice">A document expires soon. Upload the renewed copy now so you aren't hidden on the expiry day.</Banner>
      ) : null}

      <Heading>What drivers see</Heading>
      <Card>
        <Body>{operator.phone}</Body>
        <Body muted>
          {[
            operator.hookup_fee != null ? `$${Number(operator.hookup_fee)} hookup` : null,
            operator.per_mile_rate != null ? `$${Number(operator.per_mile_rate)}/mi` : null,
          ]
            .filter(Boolean)
            .join(' + ') || 'No rates posted. Drivers trust posted rates more.'}
        </Body>
        <Body muted>{operator.services.join(', ')}</Body>
        <Button tone="secondary" label="Edit company and rates" onPress={onEditProfile} />
      </Card>

      <TrucksSection operatorId={operator.id} trucks={trucks} onChanged={reload} />
      <DocumentsSection operatorId={operator.id} userId={userId} documents={documents} onChanged={reload} />

      <View style={{ marginTop: 8 }}>
        <Button tone="link" label="Sign out" onPress={onSignOut} />
      </View>
    </Screen>
  );
}
