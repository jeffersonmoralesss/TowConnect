import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// After bundling, MapLibre can't find its worker next to its own code, so point it at the copy Vite ships.
setWorkerUrl(workerUrl)

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const STYLE_URL = import.meta.env.VITE_MAP_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty'

// Map of the driver and nearby operators. Operator pins sit on rounded (approximate) positions.
//
// React normally owns the page's HTML, but MapLibre draws its own map and manages its own markers.
// So this component creates the map once, keeps it in a ref (a box React doesn't re-render), and then
// uses effects to push changes into it: recenter, move the "you" dot, add/move/remove truck pins.
export default function MapView({ center, userLocation, operators, selectedId, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const userMarkerRef = useRef(null)
  const [failed, setFailed] = useState(false)

  // Create the map once.
  useEffect(() => {
    let map
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: STYLE_URL,
        center: [center.lng, center.lat],
        zoom: 12,
        attributionControl: { compact: true },
      })
    } catch {
      setFailed(true)
      return undefined
    }
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    const markers = markersRef.current
    return () => {
      markers.forEach((m) => m.remove())
      markers.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Recenter when the search point changes.
  useEffect(() => {
    const map = mapRef.current
    map?.easeTo({ center: [center.lng, center.lat], animate: map.loaded() && !reducedMotion() })
  }, [center.lat, center.lng])

  // The driver's own position.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (!userLocation) {
      userMarkerRef.current?.remove()
      userMarkerRef.current = null
      return
    }
    if (!userMarkerRef.current) {
      const el = document.createElement('div')
      el.className = 'you-dot'
      el.setAttribute('aria-label', 'Your location')
      userMarkerRef.current = new Marker({ element: el })
    }
    userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]).addTo(map)
  }, [userLocation])

  // Operator pins: add, move and remove to match the list.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const markers = markersRef.current
    const seen = new Set()

    operators.forEach((op, index) => {
      seen.add(op.id)
      let marker = markers.get(op.id)
      if (!marker) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'truck-pin'
        el.addEventListener('click', (event) => {
          event.stopPropagation()
          onSelect(el.dataset.id)
        })
        marker = new Marker({ element: el, anchor: 'bottom', offset: [0, -9] }) // tail tip on the point
        markers.set(op.id, marker)
      }
      const el = marker.getElement()
      el.dataset.id = op.id
      el.textContent = String(index + 1)
      el.setAttribute('aria-label', `${op.company_name}, number ${index + 1} on the list`)
      el.classList.toggle('selected', op.id === selectedId)
      marker.setLngLat([op.approx_lng, op.approx_lat]).addTo(map)
    })

    markers.forEach((marker, id) => {
      if (!seen.has(id)) {
        marker.remove()
        markers.delete(id)
      }
    })
  }, [operators, selectedId, onSelect])

  // Frame the search point and the three closest trucks, once per search point.
  // Only once, so the 20-second refresh never yanks the map away while the driver is panning it.
  const framedRef = useRef(null)
  useEffect(() => {
    const map = mapRef.current
    const key = `${center.lat},${center.lng}`
    if (!map || operators.length === 0 || framedRef.current === key) return
    framedRef.current = key
    const points = [[center.lng, center.lat], ...operators.slice(0, 3).map((op) => [op.approx_lng, op.approx_lat])]
    const lngs = points.map((p) => p[0])
    const lats = points.map((p) => p[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      // Jump if the style is still loading (animations wait on it); animate once it's ready.
      { padding: { top: 72, bottom: 32, left: 40, right: 64 }, maxZoom: 14, animate: map.loaded() && !reducedMotion() },
    )
  }, [operators, center.lat, center.lng])

  if (failed) {
    return (
      <div className="map map-fallback">
        <p>The map could not load on this device. The list below still works.</p>
      </div>
    )
  }

  return <div className="map" ref={containerRef} role="region" aria-label="Map of nearby tow trucks" />
}
