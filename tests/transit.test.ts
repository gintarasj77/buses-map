import { describe, expect, it } from 'vitest'
import { decodePolyline, parseGpsFeed } from '../src/lib/transit'

describe('decodePolyline', () => {
  it('decodes a known encoded polyline', () => {
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@'
    const points = decodePolyline(encoded)

    expect(points).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ])
  })
})

describe('parseGpsFeed', () => {
  it('parses valid GPS lines and scales coordinates', () => {
    const feed = [
      '0,117,25279700,54687200,32,180,bus-117-a',
      '0,117,25280123,54687567,28,275,bus-117-b',
    ].join('\n')

    const vehicles = parseGpsFeed(feed)

    expect(vehicles).toHaveLength(2)
    expect(vehicles[0]).toMatchObject({
      route: '117',
      lon: 25.2797,
      lat: 54.6872,
      speedKmh: 32,
      headingDeg: 180,
      vehicleId: 'bus-117-a',
    })
    expect(vehicles[1]).toMatchObject({
      route: '117',
      lon: 25.280123,
      lat: 54.687567,
      speedKmh: 28,
      headingDeg: 275,
      vehicleId: 'bus-117-b',
    })
  })

  it('drops invalid coordinates and defaults missing vehicleId', () => {
    const feed = [
      '0,117,25279700,54687200,15,120',
      '0,117,not_a_number,54687200,15,120,bus-117-invalid',
      '0,117,25279999,54687444,19,240,bus-117-valid',
    ].join('\n')

    const vehicles = parseGpsFeed(feed)

    expect(vehicles).toHaveLength(2)
    expect(vehicles[0].vehicleId).toBe('unknown')
    expect(vehicles[1].vehicleId).toBe('bus-117-valid')
  })
})
