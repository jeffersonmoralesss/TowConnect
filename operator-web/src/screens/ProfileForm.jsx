// Company profile and rates, for creating and editing. A line-for-line port of the Android app's ProfileForm.
import { useState } from 'react'
import { Banner, Body, Button, Chip, Field, Heading, Screen, Title } from '../components/ui'
import { saveOperator } from '../lib/api'
import { checkCompanyName, checkLicense, checkPhone, checkRateNotes, checkUsdot, parseMoney } from '../shared/validate'

export const SERVICE_OPTIONS = ['Towing', 'Jump start', 'Lockout', 'Tire change', 'Winch out', 'Fuel delivery', 'Accident recovery', 'Heavy duty']

const moneyText = (n) => (n == null ? '' : String(Number(n)))

export default function ProfileForm({ userId, operator, onSaved, onCancel }) {
  const editing = Boolean(operator)
  const approved = operator?.status === 'approved'
  const [form, setForm] = useState({
    company_name: operator?.company_name ?? '',
    contact_name: operator?.contact_name ?? '',
    phone: operator?.phone ?? '',
    license_number: operator?.license_number ?? '',
    usdot_number: operator?.usdot_number ?? '',
    hookup_fee: moneyText(operator?.hookup_fee),
    per_mile_rate: moneyText(operator?.per_mile_rate),
    rate_notes: operator?.rate_notes ?? '',
  })
  const [services, setServices] = useState(operator?.services ?? ['Towing'])
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState(null)
  const [busy, setBusy] = useState(false)

  // set('phone') returns an onChange handler that updates form.phone.
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const toggleService = (name) =>
    setServices((list) => (list.includes(name) ? list.filter((s) => s !== name) : [...list, name]))

  const save = async (event) => {
    event.preventDefault()
    const hookup = parseMoney(form.hookup_fee)
    const perMile = parseMoney(form.per_mile_rate)
    const next = {
      company_name: checkCompanyName(form.company_name),
      phone: checkPhone(form.phone),
      license_number: approved ? null : checkLicense(form.license_number),
      usdot_number: checkUsdot(form.usdot_number),
      hookup_fee: hookup.error,
      per_mile_rate: perMile.error,
      rate_notes: checkRateNotes(form.rate_notes),
      services: services.length ? null : 'Pick at least one service.',
    }
    setErrors(next)
    setSaveError(null)
    if (Object.values(next).some(Boolean)) return

    const fields = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim(),
      usdot_number: form.usdot_number.trim() || null,
      services,
      hookup_fee: hookup.value,
      per_mile_rate: perMile.value,
      rate_notes: form.rate_notes.trim() || null,
    }
    // After approval the database locks the license number, so we don't send it.
    if (!approved) fields.license_number = form.license_number.trim()
    if (!editing) fields.user_id = userId

    setBusy(true)
    try {
      onSaved(await saveOperator(fields, operator?.id))
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <Title>{editing ? 'Company and rates' : 'Your company'}</Title>
      <Body muted>Drivers see this when they tap your truck. Posting your rates up front builds trust.</Body>

      <form onSubmit={save} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Company name" value={form.company_name} onChange={set('company_name')} error={errors.company_name} autoComplete="organization" />
        <Field label="Your name (optional)" value={form.contact_name} onChange={set('contact_name')} autoComplete="name" />
        <Field label="Phone drivers will call" type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" />
        <Field
          label="DC tow license number"
          value={form.license_number}
          onChange={set('license_number')}
          error={errors.license_number}
          disabled={approved}
          autoCapitalize="characters"
          hint={approved ? 'Locked after approval. Contact Tow Connect to change it.' : 'We check this in DC’s SCOUT license system.'}
        />
        <Field label="USDOT number (optional)" inputMode="numeric" value={form.usdot_number} onChange={set('usdot_number')} error={errors.usdot_number} />

        <Heading>Services</Heading>
        <div className="chips" role="group" aria-label="Services">
          {SERVICE_OPTIONS.map((name) => (
            <Chip key={name} label={name} selected={services.includes(name)} onClick={() => toggleService(name)} />
          ))}
        </div>
        {errors.services ? <Banner tone="bad">{errors.services}</Banner> : null}

        <Heading>Rates</Heading>
        <div className="row">
          <Field label="Hookup fee ($)" inputMode="decimal" placeholder="95" value={form.hookup_fee} onChange={set('hookup_fee')} error={errors.hookup_fee} />
          <Field label="Per mile ($)" inputMode="decimal" placeholder="4.50" value={form.per_mile_rate} onChange={set('per_mile_rate')} error={errors.per_mile_rate} />
        </div>
        <Field
          label="Rate notes (optional)"
          multiline
          placeholder="Night rate after 10 pm: +$25"
          value={form.rate_notes}
          onChange={set('rate_notes')}
          error={errors.rate_notes}
        />

        {saveError ? <Banner tone="bad">Could not save: {saveError}</Banner> : null}
        <Button type="submit" label={editing ? 'Save changes' : 'Save and continue'} busy={busy} />
        {onCancel ? <Button tone="secondary" label="Cancel" onClick={onCancel} /> : null}
      </form>
    </Screen>
  )
}
