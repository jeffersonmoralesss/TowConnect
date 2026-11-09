// What a new operator sees until approval. Port of the Android app's SetupScreen.
import { useState } from 'react'
import DocumentsSection from '../components/DocumentsSection'
import TrucksSection from '../components/TrucksSection'
import { Banner, Body, Button, Card, Heading, Loading, Screen, Title } from '../components/ui'
import { useOperatorData } from '../lib/useOperatorData'
import { allRequiredUploaded } from '../shared/documents'

export default function SetupScreen({ operator, userId, onEditProfile, onCheckStatus, onSignOut }) {
  const { trucks, documents, loading, error, reload } = useOperatorData(operator.id)
  const [checking, setChecking] = useState(false)
  if (loading) return <Loading />

  const steps = [
    { label: 'Company and rates', done: true },
    { label: 'At least one truck', done: trucks.length > 0 },
    { label: 'Tow license and insurance uploaded', done: allRequiredUploaded(documents) },
  ]
  const ready = steps.every((s) => s.done)

  const check = async () => {
    setChecking(true)
    await Promise.all([onCheckStatus(), reload()])
    setChecking(false)
  }

  return (
    <Screen>
      <Title>{ready ? 'Waiting for approval' : 'Finish your application'}</Title>
      {ready ? (
        <Banner tone="good">
          Thanks. A Tow Connect reviewer checks your license in DC's SCOUT system and your insurance. Once you're approved,
          this page changes to the Available switch.
        </Banner>
      ) : (
        <Body muted>Drivers can't see you until all three steps are done and a reviewer approves you.</Body>
      )}
      {error ? <Banner tone="bad">Could not load your details: {error}</Banner> : null}

      <Card>
        <ul className="checklist">
          {steps.map((step) => (
            <li key={step.label}>
              <span className={step.done ? 'tick tick-done' : 'tick'} aria-hidden="true">
                {step.done ? '✓' : '○'}
              </span>
              <span>
                {step.label}
                <span className="visually-hidden">{step.done ? ' (done)' : ' (not done)'}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      {ready ? <Button label="Check approval status" onClick={check} busy={checking} /> : null}

      <Heading>{operator.company_name}</Heading>
      <Body muted>
        {operator.phone} · License {operator.license_number}
      </Body>
      <Button tone="secondary" label="Edit company and rates" onClick={onEditProfile} />

      <TrucksSection operatorId={operator.id} trucks={trucks} onChanged={reload} />
      <DocumentsSection operatorId={operator.id} userId={userId} documents={documents} onChanged={reload} />

      <div>
        <Button tone="link" label="Sign out" onClick={onSignOut} />
      </div>
    </Screen>
  )
}
