// Licensed tow companies that are NOT on Tow Connect. They're shown differently on purpose: grey
// lettered pins and outlined Call buttons, because we can't confirm they're free right now or what
// they charge. Amber stays reserved for live, verified Tow Connect trucks.
import { formatMiles } from '../lib/geo.js'
import { telHref } from '../lib/format.js'

// A, B, C… so letters on the list match letters on the map (live trucks use 1, 2, 3).
export const letterFor = (index) => String.fromCharCode(65 + index)

export default function ListingList({ listings, selectedId, onSelect, intro }) {
  return (
    <section className="directory" aria-labelledby="directory-title">
      <h2 id="directory-title" className="directory-title">
        Other licensed tow companies nearby
      </h2>
      <p className="directory-intro">{intro}</p>
      <ol className="operator-list listing-list">
        {listings.map((c, index) => (
          <li key={c.id} className={c.id === selectedId ? 'selected' : undefined}>
            <button type="button" className="operator-row" onClick={() => onSelect(c.id)}>
              <span className="rank rank-listing" aria-hidden="true">
                {letterFor(index)}
              </span>
              <span className="row-text">
                <span className="row-name">{c.name}</span>
                <span className="row-meta">
                  {/* Home-based listings: their distance comes from a coarse ~3-mile grid point (to protect
                      the home address), so a mileage number would mislead. Show the area instead. */}
                  {c.pin_lat == null ? `Serves ${c.area_label ?? 'this area'}` : `${formatMiles(c.distance_km)} away`}
                </span>
                <span className="row-meta">Not on Tow Connect: call to ask if they're free</span>
              </span>
            </button>
            <a className="row-call row-call-listing" href={telHref(c.phone)} aria-label={`Call ${c.name}`}>
              Call
            </a>
          </li>
        ))}
      </ol>
    </section>
  )
}
