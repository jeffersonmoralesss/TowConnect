// Details for a directory listing (a company not on Tow Connect). Same bottom-sheet behavior as
// OperatorSheet, but honest about what we don't know: availability and prices.
import { useEffect, useRef } from 'react'
import { formatMiles } from '../lib/geo.js'
import { licenseLine, telHref } from '../lib/format.js'

const BILL_OF_RIGHTS_URL = 'https://dlcp.dc.gov/node/1837481'
const JOIN_URL = import.meta.env.VITE_OPERATOR_SIGNUP_URL

export default function ListingSheet({ listing, onClose }) {
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-top">
          <h2 id="listing-title">{listing.name}</h2>
          <button type="button" className="close-button" onClick={onClose} ref={closeRef} aria-label="Close">
            ✕
          </button>
        </div>

        {listing.is_demo ? (
          <p className="demo-note">Sample listing for testing. The phone number is fictional.</p>
        ) : null}
        <p className="listing-badge">Not on Tow Connect</p>
        <p className="sheet-meta">
          {listing.pin_lat == null
            ? `Serves ${listing.area_label ?? 'this area'}. Exact location not shown.`
            : `${listing.address ?? 'Address not listed'}. ${formatMiles(listing.distance_km)} away.`}
        </p>

        <a className="call-button call-button-listing" href={telHref(listing.phone)}>
          <span className="call-label">Call</span>
          <span className="call-number">{listing.phone}</span>
        </a>

        <p className="price-tip">
          We can't see whether they're free right now or what they charge. Ask for the total price, and how soon they can
          arrive, before you agree.
        </p>

        <dl className="facts">
          {listing.services?.length > 0 && (
            <div>
              <dt>Services</dt>
              <dd>{listing.services.join(', ')}</dd>
            </div>
          )}
          <div>
            <dt>License</dt>
            <dd>{licenseLine(listing)}</dd>
          </div>
        </dl>

        <div className="sheet-links">
          <a href={BILL_OF_RIGHTS_URL} target="_blank" rel="noreferrer">
            Your rights when your car is towed in DC
          </a>
          {JOIN_URL ? (
            <a href={JOIN_URL} target="_blank" rel="noreferrer">
              Is this your company? Join Tow Connect
            </a>
          ) : null}
        </div>
        {listing.source === 'dc_license' ? (
          <p className="fine-print">License information from DC's Department of Licensing and Consumer Protection (Open Data DC).</p>
        ) : null}
      </section>
    </div>
  )
}
