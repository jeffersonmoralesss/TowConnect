// Shown when an admin has suspended the operator (FR-A2). The database already keeps them off the map;
// this screen just explains why the Available switch is gone.
import { Banner, Body, Button, Screen, Title } from '../components/ui';

export default function SuspendedScreen({ onCheckStatus, onSignOut }) {
  return (
    <Screen>
      <Title>Your account is paused</Title>
      <Banner tone="bad">
        A Tow Connect reviewer paused your listing, usually because of a driver report or an expired document. Drivers
        can't see you while it's paused.
      </Banner>
      <Body>Reply to the email from Tow Connect, or contact the team, to sort it out. Once it's resolved, tap below.</Body>
      <Button label="Check status again" onPress={onCheckStatus} />
      <Button tone="link" label="Sign out" onPress={onSignOut} />
    </Screen>
  );
}
