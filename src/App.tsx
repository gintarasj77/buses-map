import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet'
import { DivIcon, LatLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

// Simple polyline decoder
function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = []
  let index = 0,
    lat = 0,
    lng = 0
  while (index < encoded.length) {
    let result = 0,
      shift = 0
    let c: number
    do {
      c = encoded.charCodeAt(index++) - 63
      result |= (c & 0x1f) << shift
      shift += 5
    } while (c >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : result >> 1
    result = 0
    shift = 0
    do {
      c = encoded.charCodeAt(index++) - 63
      result |= (c & 0x1f) << shift
      shift += 5
    } while (c >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : result >> 1
    points.push([lat / 1e5, lng / 1e5])
  }
  return points
}

type Vehicle = {
  mode: number
  route: string
  lon: number
  lat: number
  speedKmh: number
  headingDeg: number
  vehicleId: string
}

type RouteData = {
  ab: Array<[number, number]>[]
  ba: Array<[number, number]>[]
}

const GPS_URL = '/api/gps'
const POLL_MS = 3_000

function createHeadingIcon(headingDeg: number, mode: number): DivIcon {
  const normalized = Number.isFinite(headingDeg)
    ? ((headingDeg % 360) + 360) % 360
    : 0
  const isTrolley = mode === 1
  const strokeColor = isTrolley ? '#ef4444' : '#0ea5e9'
  const fillColor = isTrolley ? '#dc2626' : '#1e293b'
  return new DivIcon({
    className: '',
    html: `
      <div style="transform: rotate(${normalized}deg); width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
        <svg width="48" height="48" viewBox="0 0 48 48">
          <!-- Bus body shadow -->
          <rect x="11" y="13" width="26" height="24" rx="3" fill="rgba(0,0,0,0.3)"/>
          <!-- Bus body -->
          <rect x="10" y="10" width="26" height="24" rx="3" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2.5"/>
          <!-- Windshield -->
          <rect x="14" y="13" width="18" height="8" rx="1" fill="${strokeColor}" opacity="0.7"/>
          <!-- Windows -->
          <rect x="13" y="23" width="8" height="6" rx="1" fill="${strokeColor}" opacity="0.7"/>
          <rect x="25" y="23" width="8" height="6" rx="1" fill="${strokeColor}" opacity="0.7"/>
          <!-- Headlights -->
          <circle cx="15" cy="32" r="2" fill="#fef08a"/>
          <circle cx="31" cy="32" r="2" fill="#fef08a"/>
          <!-- Direction indicator (triangle at front) -->
          <path d="M 24 5 L 29 11 L 19 11 Z" fill="${strokeColor}"/>
        </svg>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -18],
  })
}

function parseGpsFeed(text: string): Vehicle[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6)
    .map((cells) => {
      const [modeRaw, route, lonRaw, latRaw, speedRaw, headingRaw, vehicleId] =
        cells

      return {
        mode: Number(modeRaw) || 0,
        route,
        lon: Number(lonRaw) / 1_000_000,
        lat: Number(latRaw) / 1_000_000,
        speedKmh: Number(speedRaw) || 0,
        headingDeg: Number(headingRaw) || 0,
        vehicleId: vehicleId ?? 'unknown',
      }
    })
    .filter((vehicle) => Number.isFinite(vehicle.lat) && Number.isFinite(vehicle.lon))
}

function FitToVehicles({
  vehicles,
  routes,
  routeKey,
}: {
  vehicles: Vehicle[]
  routes: RouteData
  routeKey: string
}) {
  const map = useMap()
  const prevRouteKey = useRef(routeKey)
  const hasFitForRoute = useRef(false)

  useEffect(() => {
    // Only fit when route changes
    const routeChanged = prevRouteKey.current !== routeKey
    if (routeChanged) {
      prevRouteKey.current = routeKey
      hasFitForRoute.current = false
    }

    // Only fit once per route selection
    if (hasFitForRoute.current) return
    if (vehicles.length === 0 && routes.ab[0]?.length === 0 && routes.ba[0]?.length === 0) return

    const allPoints: Array<[number, number]> = [
      ...vehicles.map((v) => [v.lat, v.lon] as [number, number]),
      ...(routes.ab[0] || []),
      ...(routes.ba[0] || []),
    ]

    if (allPoints.length === 0) return

    const bounds = new LatLngBounds(allPoints)
    map.fitBounds(bounds, { padding: [40, 40] })
    hasFitForRoute.current = true
  }, [vehicles, routes, map, routeKey])

  return null
}

type AnimState = {
  vehicleId: string
  startLat: number
  startLon: number
  endLat: number
  endLon: number
  startTime: number
  duration: number
}

function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [renderVehicles, setRenderVehicles] = useState<Vehicle[]>([])
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [satelliteMode, setSatelliteMode] = useState(false)
  const [routeDirection, setRouteDirection] = useState<'ab' | 'ba'>('ba')
  const [routeData, setRouteData] = useState<RouteData>({ ab: [], ba: [] })
  const [routeError, setRouteError] = useState<string | null>(null)
  const animRef = useRef<number | undefined>(undefined)
  const animStatesRef = useRef<Map<string, AnimState>>(new Map())

  useEffect(() => {
    let cancelled = false
    let etag: string | undefined
    let lastModified: string | undefined

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms))

    const loop = async () => {
      while (!cancelled) {
        let nextDelay = POLL_MS
        try {
          const response = await fetch(GPS_URL, {
            cache: 'no-cache',
            headers: {
              ...(etag ? { 'If-None-Match': etag } : {}),
              ...(lastModified ? { 'If-Modified-Since': lastModified } : {}),
            },
          })

          if (response.status === 304) {
            nextDelay = 1_500
          } else if (response.ok) {
            etag = response.headers.get('etag') ?? etag
            lastModified = response.headers.get('last-modified') ?? lastModified
            const text = await response.text()
            const parsedRaw = parseGpsFeed(text)
            const parsed = parsedRaw.filter((v) => v.route === '117')
            setVehicles(parsed)
            setLastUpdated(new Date())
            setError(null)
            nextDelay = POLL_MS
          } else {
            throw new Error(`HTTP ${response.status}`)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error'
          setError(message)
          nextDelay = 5_000
        }

        await sleep(nextDelay)
      }
    }

    loop()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const fetchRoute = async () => {
      setRouteData({ ab: [], ba: [] })
      setRouteError(null)
      try {
        const response = await fetch(`/api/route/117?mode=0`)
        if (!response.ok) {
          setRouteError(`Route fetch failed (${response.status})`)
          return
        }
        const text = await response.text()
        if (cancelled) return
        const lines = text.split('\n').map((l) => l.trim()).filter((l) => l)

        let abPolyline = ''
        let baPolyline = ''
        let mode = ''

        for (const line of lines) {
          if (line === 'a-b') {
            mode = 'ab'
          } else if (line === 'b-a') {
            mode = 'ba'
          } else if (mode === 'ab' && !abPolyline && line && !line.match(/^B+$/)) {
            abPolyline = line
            mode = ''
          } else if (mode === 'ba' && !baPolyline && line && !line.match(/^B+$/)) {
            baPolyline = line
            mode = ''
          }
        }

        const abCoords = abPolyline ? decodePolyline(abPolyline) : []
        const baCoords = baPolyline ? decodePolyline(baPolyline) : []

        if (abCoords.length > 0 || baCoords.length > 0) {
          setRouteData({ ab: [abCoords], ba: [baCoords] })
          setRouteError(null)
        } else {
          setRouteError('No route shape found')
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch route'
        if (!cancelled) setRouteError(message)
      }
    }

    fetchRoute()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setRenderVehicles((prev) => {
      const prevMap = new Map(prev.map((v) => [v.vehicleId, v]))
      const now = performance.now()
      const ANIM_DURATION = 2_500

      const nextAnimStates = new Map<string, AnimState>()
      const nextRenderVehicles = vehicles.map((v) => {
        const prevV = prevMap.get(v.vehicleId)
        const startLat = prevV?.lat ?? v.lat
        const startLon = prevV?.lon ?? v.lon

        nextAnimStates.set(v.vehicleId, {
          vehicleId: v.vehicleId,
          startLat,
          startLon,
          endLat: v.lat,
          endLon: v.lon,
          startTime: now,
          duration: ANIM_DURATION,
        })

        return { ...v, lat: startLat, lon: startLon }
      })

      animStatesRef.current = nextAnimStates
      return nextRenderVehicles
    })
  }, [vehicles])

  useEffect(() => {
    const animate = () => {
      const now = performance.now()
      setRenderVehicles((prev) => {
        return prev.map((v) => {
          const state = animStatesRef.current.get(v.vehicleId)
          if (!state) return v
          const elapsed = now - state.startTime
          const progress = Math.min(elapsed / state.duration, 1)
          const easeProgress = progress < 1 ? progress * progress * (3 - 2 * progress) : 1
          const lat = state.startLat + (state.endLat - state.startLat) * easeProgress
          const lon = state.startLon + (state.endLon - state.startLon) * easeProgress
          return { ...v, lat, lon }
        })
      })
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
    return () => {
      if (animRef.current !== undefined) cancelAnimationFrame(animRef.current)
    }
  }, [])

  const mapCenter: [number, number] = renderVehicles.length
    ? [renderVehicles[0]?.lat ?? 54.6872, renderVehicles[0]?.lon ?? 25.2797]
    : [54.6872, 25.2797]
  const routeDirectionLabel =
    routeDirection === 'ab'
      ? 'Pilaitė -> Platiniškės'
      : 'Platiniškės -> Pilaitė'

  return (
    <div className="app-shell">
      <div className="layout">
        <header className="topbar">
          <h1 className="app-title">Bus 117</h1>

          <div className="meta">
            <div className="meta-row">
              <span className="label">Last update</span>
              <span className="value">
                {lastUpdated ? lastUpdated.toLocaleTimeString() : 'Loading...'}
              </span>
            </div>

            <button
              className={`satellite-toggle ${satelliteMode ? 'is-active' : ''}`}
              onClick={() => setSatelliteMode(!satelliteMode)}
              title="Toggle map style"
            >
              {satelliteMode ? 'Street map' : 'Satellite view'}
            </button>
            
            <button
              className="satellite-toggle"
              onClick={() => setRouteDirection(routeDirection === 'ab' ? 'ba' : 'ab')}
              title="Toggle route direction"
            >
              {`Direction: ${routeDirectionLabel}`}
            </button>

            {error ? <div className="error">Error: {error}</div> : null}
            {routeError ? <div className="error">Route: {routeError}</div> : null}
          </div>
        </header>

        <div className="support-card" aria-label="Support links">
          <div className="support-title">Buy me a coffee</div>
          <div className="support-links">
            <a
              className="support-link github"
              href="https://github.com/sponsors/gintarasj77"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub Sponsors"
              title="GitHub Sponsors"
            >
              <img
                className="support-logo"
                alt=""
                src="https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png"
              />
              <span className="support-label">GitHub</span>
            </a>
            <a
              className="support-link stripe"
              href="https://buy.stripe.com/28E3cneUn18y3ajgvd67S00"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Stripe"
              title="Stripe"
            >
              <img
                className="support-logo"
                alt=""
                src="https://stripe.com/favicon.ico"
              />
              <span className="support-label">Stripe</span>
            </a>
          </div>
        </div>

        <section className="map-panel">
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="map"
            scrollWheelZoom
          >
            <TileLayer
              attribution={
                satelliteMode
                  ? '&copy; Esri, Maxar, Earthstar Geographics'
                  : '&copy; OpenStreetMap contributors'
              }
              url={satelliteMode ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
            />
            <FitToVehicles
              vehicles={renderVehicles}
              routes={routeData}
              routeKey="117-0"
            />
            {routeDirection === 'ab' && routeData.ab.length > 0 && routeData.ab[0].length > 0 && (
              <Polyline positions={routeData.ab[0]} color="#0ea5e9" weight={5} opacity={0.8} />
            )}
            {routeDirection === 'ba' && routeData.ba.length > 0 && routeData.ba[0].length > 0 && (
              <Polyline positions={routeData.ba[0]} color="#0ea5e9" weight={5} opacity={0.8} />
            )}
            {renderVehicles.map((vehicle) => (
              <Marker
                key={`${vehicle.route}-${vehicle.vehicleId}`}
                position={[vehicle.lat, vehicle.lon]}
                icon={createHeadingIcon(vehicle.headingDeg, vehicle.mode)}
              >
                <Popup>
                  <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                    <strong style={{ fontSize: '16px', color: '#0ea5e9' }}>Route {vehicle.route}</strong>
                    <div style={{ marginTop: '8px', fontSize: '13px', lineHeight: '1.6' }}>
                      <div><strong>Vehicle ID:</strong> {vehicle.vehicleId}</div>
                      <div><strong>Speed:</strong> {vehicle.speedKmh} km/h</div>
                      <div><strong>Heading:</strong> {vehicle.headingDeg} deg</div>
                      <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                        {vehicle.lat.toFixed(5)}, {vehicle.lon.toFixed(5)}
                      </div>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </section>
      </div>
    </div>
  )
}

export default App
