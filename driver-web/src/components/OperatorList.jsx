import { formatMiles } from '../lib/geo.js'
import { rateSummary, staleLabel, telHref, truckLabel } from '../lib/format.js'

export default function OperatorList({ operators, selectedId, onSelect }) {
  return (
    <ol className="operator-list">
      {operators.map((op, index) => (
        <li key={op.id} className={op.id === selectedId ? 'selected' : undefined}>
          <button type="button" className="operator-row" onClick={() => onSelect(op.id)}>
            <span className="rank" aria-hidden="true">{index + 1}</span>
            <span className="row-text">
              <span className="row-name">{op.company_name}</span>
              <span className="row-meta">
                {formatMiles(op.distance_km)} away
                {staleLabel(op.position_age_s) ? ` · ${staleLabel(op.position_age_s)}` : ''}
              </span>
              <span className="row-meta">
                {truckLabel(op.truck_types)}, {rateSummary(op)}
              </span>
            </span>
          </button>
          <a className="row-call" href={telHref(op.phone)} aria-label={`Call ${op.company_name}`}>
            Call
          </a>
        </li>
      ))}
    </ol>
  )
}
