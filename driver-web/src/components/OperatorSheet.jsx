import { useEffect, useRef, useState } from 'react'
import { formatMiles } from '../lib/geo.js'
import { freshness, money, telHref, truckLabel } from '../lib/format.js'
import ReportForm from './ReportForm.jsx'

const BILL_OF_RIGHTS_URL = 'https://dlcp.dc.gov/node/1837481'

// Operator profile (FR-D2, FR-D3, FR-D6, FR-D7).
export default function OperatorSheet({ operator, onClose }) {
  const [reporting, setReporting] = useState(false)
  const closeRef = useRef(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hookup = money(operator.hookup_fee)
  const perMile = money(operator.per_mile_rate)

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-top">
          <h2 id="sheet-title">{operator.company_name}</h2>
          <button type="button" className="close-button" onClick={onClose} ref={closeRef} aria-label="Close">
            ✕
          </button>
        </div>

        {reporting ? (
          <ReportForm operator={operator} onClose={() => setReporting(false)} />
        ) : (
          <>
            {operator.is_demo ? (
              <p className="demo-note">Sample operator for testing. The phone number is fictional.</p>
            ) : (
              <p className="verified">
                <span className="check" aria-hidden="true">✓</span>
                Licensed and insured, checked by Tow Connect
              </p>
            )}
            <p className="sheet-meta">
              {formatMiles(operator.distance_km)} away. Pin shows an approximate area.
            </p>

            <a className="call-button" href={telHref(operator.phone)}>
              <span className="call-label">Call</span>
              <span className="call-number">{operator.phone}</span>
            </a>

            <dl className="facts">
              {hookup && (
                <div>
                  <dt>Hookup fee</dt>
                  <dd>{hookup}</dd>
                </div>
              )}
              {perMile && (
                <div>
                  <dt>Per mile</dt>
                  <dd>{perMile}</dd>
                </div>
              )}
              <div>
                <dt>Truck</dt>
                <dd>{truckLabel(operator.truck_types)}</dd>
              </div>
              {operator.services?.length > 0 && (
                <div>
                  <dt>Services</dt>
                  <dd>{operator.services.join(', ')}</dd>
                </div>
              )}
              <div>
                <dt>{operator.jurisdiction} tow license</dt>
                <dd>{operator.license_number}</dd>
              </div>
              {operator.usdot_number && (
                <div>
                  <dt>USDOT number</dt>
                  <dd>{operator.usdot_number}</dd>
                </div>
              )}
            </dl>
            {operator.rate_notes && <p className="rate-notes">{operator.rate_notes}</p>}
            <p className="price-tip">Confirm the total price on the phone before the truck is sent.</p>

            <div className="sheet-links">
              <a href={BILL_OF_RIGHTS_URL} target="_blank" rel="noreferrer">
                Your rights when your car is towed in DC
              </a>
              <button type="button" className="link-button" onClick={() => setReporting(true)}>
                Report this operator
              </button>
            </div>
            {freshness(operator.position_age_s) && <p className="fine-print">{freshness(operator.position_age_s)}</p>}
          </>
        )}
      </section>
    </div>
  )
}
