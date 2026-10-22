// What a new operator sees until an admin approves them (FR-O2, FR-O3).
// A checklist of three steps, then "Waiting for approval".
import { useState } from 'react';
import { Text, View } from 'react-native';
import DocumentsSection from '../components/DocumentsSection';
import TrucksSection from '../components/TrucksSection';
import { Banner, Body, Button, Card, Heading, Loading, Screen, Title } from '../components/ui';
import { allRequiredUploaded } from '../lib/documents';
import { useOperatorData } from '../lib/useOperatorData';
import { colors } from '../theme';

export default function SetupScreen({ operator, userId, onEditProfile, onCheckStatus, onSignOut }) {
  const { trucks, documents, loading, error, reload } = useOperatorData(operator.id);
  const [checking, setChecking] = useState(false);

  if (loading) return <Loading />;

  const steps = [
    { label: 'Company and rates', done: true },
    { label: 'At least one truck', done: trucks.length > 0 },
    { label: 'Tow license and insurance uploaded', done: allRequiredUploaded(documents) },
  ];
  const ready = steps.every((s) => s.done);

  const check = async () => {
    setChecking(true);
    await Promise.all([onCheckStatus(), reload()]);
    setChecking(false);
  };

  return (
    <Screen>
      <Title>{ready ? 'Waiting for approval' : 'Finish your application'}</Title>
      {ready ? (
        <Banner tone="good">
          Thanks. A Tow Connect reviewer checks your license in DC's SCOUT system and your insurance. Once you're approved,
          this screen changes to the Available switch.
        </Banner>
      ) : (
        <Body muted>Drivers can't see you until all three steps are done and a reviewer approves you.</Body>
      )}
      {error ? <Banner tone="bad">Could not load your details: {error}</Banner> : null}

      <Card>
        {steps.map((step) => (
          <View key={step.label} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <Text
              style={{ fontSize: 18, fontWeight: '800', width: 24, color: step.done ? colors.verified : colors.muted }}
              accessibilityLabel={step.done ? 'Done' : 'Not done'}
            >
              {step.done ? '✓' : '○'}
            </Text>
            <Body style={{ flex: 1 }}>{step.label}</Body>
          </View>
        ))}
      </Card>
      {ready ? <Button label="Check approval status" onPress={check} busy={checking} /> : null}

      <Heading>{operator.company_name}</Heading>
      <Body muted>
        {operator.phone} · License {operator.license_number}
      </Body>
      <Button tone="secondary" label="Edit company and rates" onPress={onEditProfile} />

      <TrucksSection operatorId={operator.id} trucks={trucks} onChanged={reload} />
      <DocumentsSection operatorId={operator.id} userId={userId} documents={documents} onChanged={reload} />

      <Button tone="link" label="Sign out" onPress={onSignOut} />
    </Screen>
  );
}
