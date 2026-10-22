// The operator's trucks. Drivers see the truck type ("Flatbed", "Wheel-lift") because it decides
// what can be towed: many all-wheel-drive and low cars need a flatbed.
import { useState } from 'react';
import { Text, View } from 'react-native';
import { addTruck, removeTruck } from '../lib/api';
import { colors } from '../theme';
import { Banner, Body, Button, Card, Chip, Field, Heading } from './ui';

export const TRUCK_TYPES = [
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'wheel_lift', label: 'Wheel-lift' },
  { value: 'heavy_duty', label: 'Heavy duty' },
];
const labelOf = (value) => TRUCK_TYPES.find((t) => t.value === value)?.label ?? value;

export default function TrucksSection({ operatorId, trucks, onChanged }) {
  const [adding, setAdding] = useState(trucks.length === 0);
  const [type, setType] = useState('flatbed');
  const [plate, setPlate] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await addTruck(operatorId, type, plate);
      setPlate('');
      setAdding(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    try {
      await removeTruck(id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <View style={{ gap: 12 }}>
      <Heading>Trucks</Heading>
      {trucks.map((t) => (
        <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{labelOf(t.type)}</Text>
            {t.plate ? <Body muted>Plate {t.plate}</Body> : null}
          </View>
          {trucks.length > 1 ? <Button tone="link" label="Remove" onPress={() => remove(t.id)} /> : null}
        </Card>
      ))}

      {adding ? (
        <Card>
          <Body>Truck type</Body>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TRUCK_TYPES.map((t) => (
              <Chip key={t.value} label={t.label} selected={type === t.value} onPress={() => setType(t.value)} />
            ))}
          </View>
          <Field label="License plate (optional)" value={plate} onChangeText={setPlate} autoCapitalize="characters" />
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button label="Add truck" onPress={save} busy={busy} />
          {trucks.length > 0 ? <Button tone="link" label="Cancel" onPress={() => setAdding(false)} /> : null}
        </Card>
      ) : (
        <Button tone="secondary" label="Add another truck" onPress={() => setAdding(true)} />
      )}
    </View>
  );
}
