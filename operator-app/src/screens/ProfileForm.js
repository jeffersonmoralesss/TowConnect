// Company profile and rates (FR-O2, FR-O7). Used both to create the operator row and to edit it.
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Body, Button, Chip, Field, Heading, Screen, Title } from '../components/ui';
import { saveOperator } from '../lib/api';
import {
  checkCompanyName,
  checkLicense,
  checkPhone,
  checkRateNotes,
  checkUsdot,
  parseMoney,
} from '../lib/validate';

// The services drivers see on a profile. A fixed list keeps profiles consistent and easy to compare.
export const SERVICE_OPTIONS = ['Towing', 'Jump start', 'Lockout', 'Tire change', 'Winch out', 'Fuel delivery', 'Accident recovery', 'Heavy duty'];

const moneyText = (n) => (n == null ? '' : String(Number(n)));

export default function ProfileForm({ userId, operator, onSaved, onCancel }) {
  const editing = Boolean(operator);
  const approved = operator?.status === 'approved';

  // One state object for the whole form. Each field starts from the saved operator when editing.
  const [form, setForm] = useState({
    company_name: operator?.company_name ?? '',
    contact_name: operator?.contact_name ?? '',
    phone: operator?.phone ?? '',
    license_number: operator?.license_number ?? '',
    usdot_number: operator?.usdot_number ?? '',
    hookup_fee: moneyText(operator?.hookup_fee),
    per_mile_rate: moneyText(operator?.per_mile_rate),
    rate_notes: operator?.rate_notes ?? '',
  });
  const [services, setServices] = useState(operator?.services ?? ['Towing']);
  const [errors, setErrors] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Returns an onChangeText handler for one field: set('phone') -> (text) => update form.phone.
  const set = (key) => (text) => setForm((f) => ({ ...f, [key]: text }));

  const toggleService = (name) =>
    setServices((list) => (list.includes(name) ? list.filter((s) => s !== name) : [...list, name]));

  const save = async () => {
    const hookup = parseMoney(form.hookup_fee);
    const perMile = parseMoney(form.per_mile_rate);
    const next = {
      company_name: checkCompanyName(form.company_name),
      phone: checkPhone(form.phone),
      license_number: approved ? null : checkLicense(form.license_number),
      usdot_number: checkUsdot(form.usdot_number),
      hookup_fee: hookup.error,
      per_mile_rate: perMile.error,
      rate_notes: checkRateNotes(form.rate_notes),
      services: services.length ? null : 'Pick at least one service.',
    };
    setErrors(next);
    setSaveError(null);
    if (Object.values(next).some(Boolean)) return;

    const fields = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim(),
      usdot_number: form.usdot_number.trim() || null,
      services,
      hookup_fee: hookup.value,
      per_mile_rate: perMile.value,
      rate_notes: form.rate_notes.trim() || null,
    };
    // After approval the license number is locked by the database (an admin checked that exact
    // number), so we don't send it. Before approval the operator can still fix a typo.
    if (!approved) fields.license_number = form.license_number.trim();
    if (!editing) fields.user_id = userId;

    setBusy(true);
    try {
      onSaved(await saveOperator(fields, operator?.id));
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{editing ? 'Company and rates' : 'Your company'}</Title>
      <Body muted>Drivers see this when they tap your truck. Posting your rates up front builds trust.</Body>

      <Field label="Company name" value={form.company_name} onChangeText={set('company_name')} error={errors.company_name} />
      <Field label="Your name (optional)" value={form.contact_name} onChangeText={set('contact_name')} autoComplete="name" />
      <Field
        label="Phone drivers will call"
        value={form.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <Field
        label="DC tow license number"
        value={form.license_number}
        onChangeText={set('license_number')}
        error={errors.license_number}
        autoCapitalize="characters"
        editable={!approved}
        hint={approved ? 'Locked after approval. Contact Tow Connect to change it.' : 'We check this in DC’s SCOUT license system.'}
      />
      <Field
        label="USDOT number (optional)"
        value={form.usdot_number}
        onChangeText={set('usdot_number')}
        error={errors.usdot_number}
        keyboardType="number-pad"
      />

      <Heading>Services</Heading>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {SERVICE_OPTIONS.map((name) => (
          <Chip key={name} label={name} selected={services.includes(name)} onPress={() => toggleService(name)} />
        ))}
      </View>
      {errors.services ? <Banner tone="bad">{errors.services}</Banner> : null}

      <Heading>Rates</Heading>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Field
            label="Hookup fee ($)"
            value={form.hookup_fee}
            onChangeText={set('hookup_fee')}
            error={errors.hookup_fee}
            keyboardType="decimal-pad"
            placeholder="95"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Field
            label="Per mile ($)"
            value={form.per_mile_rate}
            onChangeText={set('per_mile_rate')}
            error={errors.per_mile_rate}
            keyboardType="decimal-pad"
            placeholder="4.50"
          />
        </View>
      </View>
      <Field
        label="Rate notes (optional)"
        value={form.rate_notes}
        onChangeText={set('rate_notes')}
        error={errors.rate_notes}
        placeholder="Night rate after 10 pm: +$25"
        multiline
      />

      {saveError ? <Banner tone="bad">Could not save: {saveError}</Banner> : null}
      <Button label={editing ? 'Save changes' : 'Save and continue'} onPress={save} busy={busy} />
      {onCancel ? <Button tone="secondary" label="Cancel" onPress={onCancel} /> : null}
    </Screen>
  );
}
