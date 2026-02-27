import { useCallback, useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, Polyline, TileLayer, useMap } from 'react-leaflet'
import { DivIcon, LatLngBounds } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'
import { decodePolyline, parseGpsFeed, type Vehicle } from './lib/transit'

type RouteData = {
  ab: Array<[number, number]>
  ba: Array<[number, number]>
}

const GPS_URL = '/api/gps'
const ROUTE_URL = '/api/route'
const ROUTE_ID = '117'
const POLL_MS = 3_000
const STALE_AFTER_MS = POLL_MS * 4
const POSITION_EPSILON = 1e-7

function createHeadingIcon(headingDeg: number): DivIcon {
  const normalized = Number.isFinite(headingDeg)
    ? ((headingDeg % 360) + 360) % 360
    : 0
  const strokeColor = '#78a7ff'
  const fillColor = '#152335'
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

const headingIconCache = new Map<number, DivIcon>()

function getHeadingIcon(headingDeg: number): DivIcon {
  const normalized = Number.isFinite(headingDeg)
    ? ((Math.round(headingDeg) % 360) + 360) % 360
    : 0
  const cached = headingIconCache.get(normalized)
  if (cached) return cached
  const icon = createHeadingIcon(normalized)
  headingIconCache.set(normalized, icon)
  return icon
}

function FitToVehicles({
  vehicles,
  routeData,
}: {
  vehicles: Vehicle[]
  routeData: RouteData
}) {
  const map = useMap()
  const hasFit = useRef(false)

  useEffect(() => {
    if (hasFit.current) return
    if (vehicles.length === 0 && routeData.ab.length === 0 && routeData.ba.length === 0) return

    const allPoints: Array<[number, number]> = [
      ...vehicles.map((v) => [v.lat, v.lon] as [number, number]),
      ...routeData.ab,
      ...routeData.ba,
    ]

    if (allPoints.length === 0) return

    const bounds = new LatLngBounds(allPoints)
    map.fitBounds(bounds, { padding: [40, 40] })
    hasFit.current = true
  }, [vehicles, routeData, map])

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
  const [clockMs, setClockMs] = useState(() => Date.now())
  const animRef = useRef<number | undefined>(undefined)
  const animStatesRef = useRef<Map<string, AnimState>>(new Map())
  const renderVehiclesRef = useRef<Vehicle[]>([])

  const startAnimationLoop = useCallback(() => {
    if (animRef.current !== undefined) return

    const animate = () => {
      const now = performance.now()
      let hasActiveAnimation = false

      for (const state of animStatesRef.current.values()) {
        if (now - state.startTime < state.duration) {
          hasActiveAnimation = true
          break
        }
      }

      setRenderVehicles((prev) => {
        let changed = false
        const next = prev.map((v) => {
          const state = animStatesRef.current.get(v.vehicleId)
          if (!state) return v

          const elapsed = now - state.startTime
          const progress = Math.min(elapsed / state.duration, 1)
          const easeProgress =
            progress < 1 ? progress * progress * (3 - 2 * progress) : 1
          const lat =
            state.startLat + (state.endLat - state.startLat) * easeProgress
          const lon =
            state.startLon + (state.endLon - state.startLon) * easeProgress
          if (
            Math.abs(lat - v.lat) < POSITION_EPSILON &&
            Math.abs(lon - v.lon) < POSITION_EPSILON
          ) {
            return v
          }
          changed = true
          return { ...v, lat, lon }
        })

        return changed ? next : prev
      })

      if (hasActiveAnimation) {
        animRef.current = requestAnimationFrame(animate)
        return
      }

      animStatesRef.current.clear()
      animRef.current = undefined
    }

    animRef.current = requestAnimationFrame(animate)
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setClockMs(Date.now())
    }, 10_000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let etag: string | undefined
    let lastModified: string | undefined
    let fetchController: AbortController | null = null

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, ms))

    const isAbortError = (error: unknown) =>
      error instanceof DOMException && error.name === 'AbortError'

    const loop = async () => {
      while (!cancelled) {
        let nextDelay = POLL_MS
        try {
          fetchController = new AbortController()
          const response = await fetch(GPS_URL, {
            cache: 'no-cache',
            headers: {
              ...(etag ? { 'If-None-Match': etag } : {}),
              ...(lastModified ? { 'If-Modified-Since': lastModified } : {}),
            },
            signal: fetchController.signal,
          })
          fetchController = null

          if (cancelled) break

          if (response.status === 304) {
            nextDelay = 1_500
          } else if (response.ok) {
            etag = response.headers.get('etag') ?? etag
            lastModified = response.headers.get('last-modified') ?? lastModified
            const text = await response.text()
            if (cancelled) break
            const parsedRaw = parseGpsFeed(text)
            const parsed = parsedRaw.filter((v) => v.route === ROUTE_ID)
            setVehicles(parsed)
            setLastUpdated(new Date())
            setError(null)
            nextDelay = POLL_MS
          } else {
            throw new Error(`HTTP ${response.status}`)
          }
        } catch (err) {
          fetchController = null
          if (cancelled && isAbortError(err)) break
          const message = err instanceof Error ? err.message : 'Unknown error'
          if (!cancelled) setError(message)
          nextDelay = 5_000
        }

        if (cancelled) break
        await sleep(nextDelay)
      }
    }

    loop()
    return () => {
      cancelled = true
      fetchController?.abort()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    const fetchRoute = async () => {
      setRouteData({ ab: [], ba: [] })
      setRouteError(null)
      try {
        const response = await fetch(ROUTE_URL, { signal: controller.signal })
        if (!response.ok) {
          if (cancelled) return
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
          setRouteData({ ab: abCoords, ba: baCoords })
          setRouteError(null)
        } else {
          setRouteError('No route shape found')
        }
      } catch (err) {
        if (controller.signal.aborted || cancelled) return
        const message = err instanceof Error ? err.message : 'Failed to fetch route'
        setRouteError(message)
      }
    }

    fetchRoute()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const prev = renderVehiclesRef.current
    const prevMap = new Map(prev.map((v) => [v.vehicleId, v]))
    const now = performance.now()
    const ANIM_DURATION = 2_500

    const nextAnimStates = new Map<string, AnimState>()
    const nextRenderVehicles = vehicles.map((v) => {
      const prevV = prevMap.get(v.vehicleId)
      const startLat = prevV?.lat ?? v.lat
      const startLon = prevV?.lon ?? v.lon
      const hasMoved =
        !!prevV &&
        (Math.abs(prevV.lat - v.lat) > POSITION_EPSILON ||
          Math.abs(prevV.lon - v.lon) > POSITION_EPSILON)

      if (hasMoved) {
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
      }

      return v
    })

    animStatesRef.current = nextAnimStates
    setRenderVehicles(nextRenderVehicles)

    if (nextAnimStates.size > 0) {
      startAnimationLoop()
    } else if (animRef.current !== undefined) {
      cancelAnimationFrame(animRef.current)
      animRef.current = undefined
    }
  }, [vehicles, startAnimationLoop])

  useEffect(() => {
    renderVehiclesRef.current = renderVehicles
  }, [renderVehicles])

  useEffect(() => {
    return () => {
      if (animRef.current !== undefined) cancelAnimationFrame(animRef.current)
    }
  }, [])

  const mapCenter: [number, number] = renderVehicles.length
    ? [renderVehicles[0]?.lat ?? 54.6872, renderVehicles[0]?.lon ?? 25.2797]
    : [54.6872, 25.2797]
  const hasLoadedData = lastUpdated !== null
  const isEmptyState = hasLoadedData && vehicles.length === 0 && !error
  const isDataStale =
    hasLoadedData && clockMs - lastUpdated.getTime() > STALE_AFTER_MS
  const routeDirectionLabel =
    routeDirection === 'ab'
      ? 'Pilait\u0117 -> Platini\u0161k\u0117s'
      : 'Platini\u0161k\u0117s -> Pilait\u0117'

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
            {isEmptyState ? (
              <div className="status-note">
                No Bus {ROUTE_ID} vehicles are visible right now.
              </div>
            ) : null}
            {isDataStale && !error ? (
              <div className="status-note stale">
                Data is stale. Waiting for a fresh GPS update.
              </div>
            ) : null}
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
              routeData={routeData}
            />
            {routeDirection === 'ab' && routeData.ab.length > 0 && (
              <Polyline positions={routeData.ab} color="#0ea5e9" weight={5} opacity={0.8} />
            )}
            {routeDirection === 'ba' && routeData.ba.length > 0 && (
              <Polyline positions={routeData.ba} color="#0ea5e9" weight={5} opacity={0.8} />
            )}
            {renderVehicles.map((vehicle) => (
              <Marker
                key={`${vehicle.route}-${vehicle.vehicleId}`}
                position={[vehicle.lat, vehicle.lon]}
                icon={getHeadingIcon(vehicle.headingDeg)}
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

