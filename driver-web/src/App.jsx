import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CheckIn from './components/CheckIn.jsx'
import ListingList from './components/ListingList.jsx'
import ListingSheet from './components/ListingSheet.jsx'
import OperatorList from './components/OperatorList.jsx'
import OperatorSheet from './components/OperatorSheet.jsx'
import { fetchNearbyListings, fetchNearbyOperators, isDemo } from './lib/api.js'
import { DC_CENTER, getCurrentPosition } from './lib/geo.js'

// The map library is large (about 290 KB zipped). lazy() splits it into its own file that only
// downloads when the map first renders, after the check-in, so the first screen opens fast on a weak signal.
const MapView = lazy(() => import('./components/MapView.jsx'))

// How often the list of trucks refreshes while the page is open.
const REFRESH_MS = 20000

export default function App() {
  const [notice, setNotice] = useState(null)
  const [checkedIn, setCheckedIn] = useState(false)

  const restart = () => {
    setCheckedIn(false)
    setNotice(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Tow Connect</span>
        {isDemo && <span className="demo-pill">Demo data</span>}
        {checkedIn && (
          <button type="button" className="link-button topbar-action" onClick={restart}>
            Start over
          </button>
        )}
      </header>
      {checkedIn ? (
        <FindTow notice={notice} />
      ) : (
        <CheckIn
          onDone={({ notice: n }) => {
            setNotice(n ?? null)
            setCheckedIn(true)
          }}
        />
      )}
    </div>
  )
}

function FindTow({ notice }) {
  const [userLocation, setUserLocation] = useState(null)
  const [locating, setLocating] = useState(true)
  const [searchPoint, setSearchPoint] = useState(DC_CENTER)
  const [operators, setOperators] = useState([])
  const [status, setStatus] = useState('loading') // loading | ready | error
  const [selectedId, setSelectedId] = useState(null)
  // Directory listings: companies not on Tow Connect. They don't move, so they load once per search
  // point instead of every 20 seconds.
  const [listings, setListings] = useState([])
  const [selectedListingId, setSelectedListingId] = useState(null)
  // A ref always holds the latest search point, so the load() function below can stay the same
  // function forever (no dependencies) and the refresh timer doesn't need restarting on every render.
  const searchRef = useRef(searchPoint)
  searchRef.current = searchPoint

  // Find the driver once.
  useEffect(() => {
    let cancelled = false
    getCurrentPosition().then((pos) => {
      if (cancelled) return
      setLocating(false)
      if (pos) {
        setUserLocation(pos)
        setSearchPoint({ lat: pos.lat, lng: pos.lng })
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setStatus('loading')
    try {
      const list = await fetchNearbyOperators(searchRef.current)
      setOperators(list)
      setStatus('ready')
    } catch {
      // A failed background refresh keeps the list the driver is already looking at.
      setStatus((s) => (quiet && s === 'ready' ? s : 'error'))
    }
  }, [])

  // Load on start and whenever the search point moves; refresh every 20 s (NFR-2).
  useEffect(() => {
    if (locating) return undefined
    load()
    const timer = setInterval(() => {
      // Skip refreshes while the tab is hidden: saves the driver's data and battery, and our free-tier requests.
      if (document.visibilityState === 'visible') load({ quiet: true })
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [locating, searchPoint.lat, searchPoint.lng, load])

  useEffect(() => {
    if (locating) return undefined
    let cancelled = false
    fetchNearbyListings(searchPoint)
      .then((list) => !cancelled && setListings(list))
      .catch(() => !cancelled && setListings([])) // the directory is extra; live trucks still work without it
    return () => {
      cancelled = true
    }
  }, [locating, searchPoint])

  const selected = useMemo(() => operators.find((op) => op.id === selectedId) ?? null, [operators, selectedId])
  const selectedListing = useMemo(
    () => listings.find((c) => c.id === selectedListingId) ?? null,
    [listings, selectedListingId],
  )
  const closeSheet = useCallback(() => setSelectedId(null), [])
  const closeListing = useCallback(() => setSelectedListingId(null), [])

  return (
    <main className="find">
      <div className="find-panel">
        {notice && <p className="notice">{notice}</p>}
        <LocationLine locating={locating} userLocation={userLocation} />
        <Results
          status={status}
          operators={operators}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRetry={() => load()}
          listings={listings}
          selectedListingId={selectedListingId}
          onSelectListing={setSelectedListingId}
        />
      </div>
      <Suspense fallback={<div className="map map-fallback">Loading map</div>}>
        <MapView
          center={searchPoint}
          userLocation={userLocation}
          operators={operators}
          selectedId={selectedId}
          onSelect={setSelectedId}
          listings={listings}
          selectedListingId={selectedListingId}
          onSelectListing={setSelectedListingId}
        />
      </Suspense>
      {selected && <OperatorSheet operator={selected} onClose={closeSheet} />}
      {selectedListing && <ListingSheet listing={selectedListing} onClose={closeListing} />}
    </main>
  )
}

function LocationLine({ locating, userLocation }) {
  if (locating) return <p className="location-line">Finding your location</p>
  if (userLocation) return <p className="location-line">Showing tow trucks near you</p>
  return (
    <p className="location-line warn">
      Location is off, so this shows trucks near downtown DC. Turn on location for this site to see trucks near you.
    </p>
  )
}

function Results({ status, operators, selectedId, onSelect, onRetry, listings, selectedListingId, onSelectListing }) {
  if (status === 'loading' && operators.length === 0) {
    return <p className="results-state" role="status">Looking for available tow trucks</p>
  }
  if (status === 'error' && operators.length === 0) {
    return (
      <div className="results-state error" role="alert">
        <p>Tow trucks could not load. Check your signal and try again.</p>
        <p>If you are in danger, call 911. You can also call the roadside number on your insurance card.</p>
        <div className="state-actions">
          <button type="button" className="primary-button" onClick={onRetry}>
            Try again
          </button>
          <a className="secondary-button danger-text" href="tel:911">
            Call 911
          </a>
        </div>
      </div>
    )
  }

  const directory =
    listings.length > 0 ? (
      <ListingList
        listings={listings}
        selectedId={selectedListingId}
        onSelect={onSelectListing}
        intro={
          operators.length
            ? "These companies aren't on Tow Connect, so we can't confirm they're free or what they charge. Call to ask."
            : "No Tow Connect trucks are live near you right now. These licensed companies aren't on Tow Connect, so call to ask if they're free and what they charge."
        }
      />
    ) : null

  if (operators.length === 0) {
    return (
      <>
        {listings.length === 0 ? (
          <div className="results-state" role="status">
            <p>No verified tow trucks are available near you right now.</p>
            <p>New trucks appear as operators come online, and this list refreshes on its own. You can also call the roadside number on your insurance card.</p>
          </div>
        ) : null}
        {directory}
      </>
    )
  }
  return (
    <>
      <h1 className="results-title">
        {operators.length} {operators.length === 1 ? 'truck' : 'trucks'} available
      </h1>
      <OperatorList operators={operators} selectedId={selectedId} onSelect={onSelect} />
      <p className="fine-print">Closest first. Tap a company for rates and license details.</p>
      {directory}
    </>
  )
}
