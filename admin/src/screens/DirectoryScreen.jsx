// The company directory: licensed tow companies that aren't on Tow Connect, shown to drivers as
// "call to ask". Here you review imported companies, add their phone numbers, and publish them.
//
// Faster than the Table Editor: one card per company with a "find phone number" link, the publish
// rules checked as you type, and a way to publish several at once.
import { useCallback, useEffect, useState } from 'react'
import { Banner, Body, Button, Card, Chip, Field } from '../components/ui'
import { addListing, listListings, setListingsStatus, updateListing } from '../lib/api'
import { checkListingPhone, mapUrl, parseLatLng, phoneSearchUrl, publishProblem, SERVICE_OPTIONS } from '../lib/listing'
import { formatDate } from '../shared/dates'
import { Segmented } from './OperatorsScreen'

const FILTERS = [
  { id: 'new', label: 'To review' },
  { id: 'published', label: 'Published' },
  { id: 'hidden', label: 'Hidden' },
  { id: 'removed', label: 'Removed' },
]

export default function DirectoryScreen({ onChange }) {
  const [filter, setFilter] = useState('new')
  const [listings, setListings] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [adding, setAdding] = useState(false)
  const [message, setMessage] = useState(null)

  const load = useCallback(async () => {
    try {
      setListings(await listListings(filter))
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    }
  }, [filter])

  useEffect(() => {
    setListings(null)
    setSelected(new Set())
    setMessage(null)
    load()
  }, [load])

  const changed = () => {
    load()
    onChange()
  }

  // Replace one listing in place after a save, so the list doesn't jump around while you work.
  const replace = (row) => {
    if (row.review_status !== filter) changed()
    else setListings((list) => list.map((l) => (l.id === row.id ? row : l)))
  }

  const shown = (listings ?? []).filter((l) => l.name.toLowerCase().includes(search.trim().toLowerCase()))
  const ready = shown.filter((l) => !publishProblem(l))

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const publishSelected = async () => {
    try {
      await setListingsStatus([...selected], 'published')
      setMessage({ tone: 'good', text: `Published ${selected.size} ${selected.size === 1 ? 'company' : 'companies'}. Drivers nearby can see them now.` })
      setSelected(new Set())
      changed()
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    }
  }

  return (
    <div className="stack">
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />
      <div className="toolbar">
        <input
          className="input"
          type="search"
          placeholder="Search by name"
          aria-label="Search by name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button tone="secondary" label={adding ? 'Close the form' : 'Add a company'} onClick={() => setAdding(!adding)} />
      </div>

      {adding ? (
        <AddCompany
          onAdded={(row) => {
            setAdding(false)
            setMessage({ tone: 'good', text: `${row.name} was added${row.review_status === 'published' ? ' and published' : ''}.` })
            changed()
          }}
        />
      ) : null}

      {filter === 'new' ? (
        <Body muted>
          For each company: find its number, check it does roadside towing for the public (not only private-lot towing), then
          Publish. Not sure? Hide it. Tick the box on ready ones to publish several at once.
        </Body>
      ) : null}
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}

      {filter === 'new' && ready.length ? (
        <div className="bulk">
          <Button
            tone="secondary"
            label={selected.size === ready.length ? 'Clear selection' : `Select all ${ready.length} ready`}
            onClick={() => setSelected(selected.size === ready.length ? new Set() : new Set(ready.map((l) => l.id)))}
          />
          <Button label={`Publish ${selected.size} selected`} disabled={!selected.size} onClick={publishSelected} />
        </div>
      ) : null}

      {listings === null ? <p className="muted">Loading…</p> : null}
      {listings && !shown.length ? <Body muted>Nothing here{search ? ' matches that search' : ''}.</Body> : null}
      {shown.map((l) => (
        <ListingCard
          key={l.id}
          listing={l}
          selectable={filter === 'new'}
          selected={selected.has(l.id)}
          onToggle={() => toggle(l.id)}
          onSaved={replace}
        />
      ))}
    </div>
  )
}

function ListingCard({ listing, selectable, selected, onToggle, onSaved }) {
  const [form, setForm] = useState(() => toForm(listing))
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState(null)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const phoneError = checkListingPhone(form.phone)
  const merged = { ...listing, ...fromForm(form) }
  const problem = publishProblem(merged)
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(fromForm(toForm(listing)))

  const save = async (status) => {
    if (phoneError) return
    setBusy(status ?? 'save')
    setMessage(null)
    try {
      const row = await updateListing(listing.id, { ...fromForm(form), ...(status ? { review_status: status } : {}) })
      setForm(toForm(row))
      onSaved(row)
      if (!status) setMessage({ tone: 'good', text: 'Saved.' })
    } catch (err) {
      setMessage({ tone: 'bad', text: err.message })
    } finally {
      setBusy(null)
    }
  }

  const fid = (k) => `${k}-${listing.id}`
  return (
    <Card>
      <div className="card-head">
        {selectable ? (
          <input
            type="checkbox"
            className="select-box"
            checked={selected}
            onChange={onToggle}
            disabled={Boolean(problem) || dirty}
            aria-label={`Select ${listing.name}`}
            title={problem ?? (dirty ? 'Save your changes first' : 'Select to publish')}
          />
        ) : null}
        <h2 className="card-title">{listing.name}</h2>
        {listing.is_demo ? <span className="pill">Sample</span> : null}
      </div>
      <p className="small muted">
        {listing.address ?? 'No address'}
        {listing.lat != null ? (
          <>
            {' · '}
            <a href={mapUrl(listing)} target="_blank" rel="noreferrer">
              map
            </a>
          </>
        ) : (
          ' · no location'
        )}
        {listing.source === 'dc_license'
          ? ` · DC license ${listing.license_status ?? ''}${listing.license_end_date ? ` through ${formatDate(listing.license_end_date)}` : ''}`
          : ' · added by hand'}
      </p>

      <div className="row wrap">
        <Field label="Phone for drivers" id={fid('phone')} value={form.phone} onChange={set('phone')} error={phoneError} inputMode="tel" />
        <div className="field link-field">
          <a href={phoneSearchUrl(listing)} target="_blank" rel="noreferrer">
            Find their phone number
          </a>
        </div>
      </div>

      <fieldset className="plain">
        <legend>Services</legend>
        <div className="chips">
          {SERVICE_OPTIONS.map((s) => (
            <Chip
              key={s}
              label={s}
              selected={form.services.includes(s)}
              onClick={() => setForm((f) => ({ ...f, services: f.services.includes(s) ? f.services.filter((x) => x !== s) : [...f.services, s] }))}
            />
          ))}
        </div>
      </fieldset>

      <label className="toggle-row">
        <input type="checkbox" checked={!form.show_exact_location} onChange={(e) => setForm((f) => ({ ...f, show_exact_location: !e.target.checked }))} />
        Runs from a home address (hide the pin and address from drivers)
      </label>
      {!form.show_exact_location ? (
        <Field label="Area to show instead" id={fid('area')} value={form.area_label} onChange={set('area_label')} placeholder="Northeast DC" maxLength={80} />
      ) : null}
      <Field label="Notes (only admins see these)" id={fid('notes')} value={form.reviewer_notes} onChange={set('reviewer_notes')} maxLength={1000} />

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      <div className="actions">
        {listing.review_status !== 'published' ? (
          <Button label="Publish" busy={busy === 'published'} disabled={Boolean(problem) || Boolean(phoneError) || Boolean(busy)} onClick={() => save('published')} />
        ) : null}
        <Button tone="secondary" label="Save" busy={busy === 'save'} disabled={!dirty || Boolean(phoneError) || Boolean(busy)} onClick={() => save()} />
        {listing.review_status !== 'hidden' ? (
          <Button tone="secondary" label="Hide" busy={busy === 'hidden'} disabled={Boolean(busy)} onClick={() => save('hidden')} />
        ) : null}
        {listing.review_status !== 'new' ? (
          <Button tone="secondary" label="Back to review" busy={busy === 'new'} disabled={Boolean(busy)} onClick={() => save('new')} />
        ) : null}
        {listing.review_status !== 'removed' ? (
          <Button
            tone="link"
            label="They asked to be removed"
            disabled={Boolean(busy)}
            onClick={() => confirm(`Mark ${listing.name} as removed? Future imports will keep it out.`) && save('removed')}
          />
        ) : null}
      </div>
      {listing.review_status !== 'published' && problem ? <p className="field-hint">To publish: {problem}</p> : null}
    </Card>
  )
}

const toForm = (l) => ({
  phone: l.phone ?? '',
  services: l.services ?? [],
  show_exact_location: l.show_exact_location ?? true,
  area_label: l.area_label ?? '',
  reviewer_notes: l.reviewer_notes ?? '',
})

const blankToNull = (v) => (v.trim() ? v.trim() : null)
const fromForm = (f) => ({
  phone: blankToNull(f.phone),
  services: f.services,
  show_exact_location: f.show_exact_location,
  area_label: blankToNull(f.area_label),
  reviewer_notes: blankToNull(f.reviewer_notes),
})

// A company that isn't in DC's data: Maryland and Virginia companies, or ones your dad knows.
function AddCompany({ onAdded }) {
  const [f, setF] = useState({ name: '', phone: '', address: '', location: '', jurisdiction: 'MD', home: false, area: '', publish: true, services: ['Towing'] })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setF((x) => ({ ...x, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    const pos = parseLatLng(f.location)
    const next = {
      name: f.name.trim().length < 2 ? 'Enter the company name.' : null,
      phone: !f.phone.trim() ? 'Enter the number drivers should call.' : checkListingPhone(f.phone),
      location: pos ? null : 'Paste the latitude and longitude, like 38.9072, -77.0369.',
      area: f.home && !f.area.trim() ? 'Add the area it serves, like "Silver Spring, MD".' : null,
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setBusy(true)
    setError(null)
    try {
      const row = await addListing({
        name: f.name.trim(),
        phone: f.phone.trim(),
        address: f.home ? null : blankToNull(f.address),
        lat: pos.lat,
        lng: pos.lng,
        show_exact_location: !f.home,
        area_label: f.home ? f.area.trim() : null,
        jurisdiction: f.jurisdiction,
        services: f.services,
        source: 'manual',
        review_status: f.publish ? 'published' : 'new',
      })
      onAdded(row)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="card-title">Add a company</h2>
      <form onSubmit={submit} noValidate className="stack">
        <Field label="Company name" value={f.name} onChange={set('name')} error={errors.name} />
        <Field label="Phone for drivers" value={f.phone} onChange={set('phone')} error={errors.phone} inputMode="tel" />
        <Field label="Address (optional)" value={f.address} onChange={set('address')} />
        <Field
          label="Location"
          value={f.location}
          onChange={set('location')}
          error={errors.location}
          hint="In Google Maps, right-click the company's spot and click the numbers at the top to copy them, then paste here."
          placeholder="38.9072, -77.0369"
        />
        <div className="field">
          <label htmlFor="add-jurisdiction">State</label>
          <select id="add-jurisdiction" className="input" value={f.jurisdiction} onChange={set('jurisdiction')}>
            <option value="DC">DC</option>
            <option value="MD">Maryland</option>
            <option value="VA">Virginia</option>
          </select>
        </div>
        <label className="toggle-row">
          <input type="checkbox" checked={f.home} onChange={set('home')} />
          Runs from a home address (hide the pin and address from drivers)
        </label>
        {f.home ? <Field label="Area to show instead" value={f.area} onChange={set('area')} error={errors.area} placeholder="Silver Spring, MD" /> : null}
        <label className="toggle-row">
          <input type="checkbox" checked={f.publish} onChange={set('publish')} />
          Publish now (I checked that they do roadside towing)
        </label>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Button type="submit" label="Add company" busy={busy} />
      </form>
    </Card>
  )
}
