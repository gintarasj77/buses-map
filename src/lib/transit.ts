export type Vehicle = {
  route: string
  lon: number
  lat: number
  speedKmh: number
  headingDeg: number
  vehicleId: string
}

export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    let result = 0
    let shift = 0
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

export function parseGpsFeed(text: string): Vehicle[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6)
    .map((cells) => {
      const [, route, lonRaw, latRaw, speedRaw, headingRaw, vehicleId] = cells

      return {
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
