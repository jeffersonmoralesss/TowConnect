// The operator's trucks. Port of the Android app's TrucksSection.
import { useState } from 'react'
import { addTruck, removeTruck } from '../lib/api'
import { Banner, Body, Button, Card, Chip, Field, Heading } from './ui'

export const TRUCK_TYPES = [
  { value: 'flatbed', label: 'Flatbed' },
  { value: 'wheel_lift', label: 'Wheel-lift' },
  { value: 'heavy_duty', label: 'Heavy duty' },
]
const labelOf = (value) => TRUCK_TYPES.find((t) => t.value === value)?.label ?? value

export default function TrucksSection({ operatorId, trucks, onChanged }) {
  const [adding, setAdding] = useState(trucks.length === 0)
  const [type, setType] = useState('flatbed')
  const [plate, setPlate] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await addTruck(operatorId, type, plate)
      setPlate('')
      setAdding(false)
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id) => {
    try {
      await removeTruck(id)
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
      <Heading>Trucks</Heading>
      {trucks.map((t) => (
        <Card key={t.id} className="card-row">
          <div>
            <p className="card-title">{labelOf(t.type)}</p>
            {t.plate ? <Body muted>Plate {t.plate}</Body> : null}
          </div>
          {trucks.length > 1 ? <Button tone="link" label="Remove" onClick={() => remove(t.id)} /> : null}
        </Card>
      ))}

      {adding ? (
        <Card>
          <Body>Truck type</Body>
          <div className="chips" role="group" aria-label="Truck type">
            {TRUCK_TYPES.map((t) => (
              <Chip key={t.value} label={t.label} selected={type === t.value} onClick={() => setType(t.value)} />
            ))}
          </div>
          <Field label="License plate (optional)" value={plate} onChange={(e) => setPlate(e.target.value)} autoCapitalize="characters" />
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button label="Add truck" onClick={save} busy={busy} />
          {trucks.length > 0 ? <Button tone="link" label="Cancel" onClick={() => setAdding(false)} /> : null}
        </Card>
      ) : (
        <Button tone="secondary" label="Add another truck" onClick={() => setAdding(true)} />
      )}
    </>
  )
}
