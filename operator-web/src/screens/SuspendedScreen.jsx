// Shown when an admin has paused the account. Port of the Android app's SuspendedScreen.
import { Banner, Body, Button, Screen, Title } from '../components/ui'

export default function SuspendedScreen({ onCheckStatus, onSignOut }) {
  return (
    <Screen>
      <Title>Your account is paused</Title>
      <Banner tone="bad">
        A Tow Connect reviewer paused your listing, usually because of a driver report or an expired document. Drivers can't
        see you while it's paused.
      </Banner>
      <Body>Reply to the email from Tow Connect, or contact the team, to sort it out. Once it's resolved, tap below.</Body>
      <Button label="Check status again" onClick={onCheckStatus} />
      <div>
        <Button tone="link" label="Sign out" onClick={onSignOut} />
      </div>
    </Screen>
  )
}
