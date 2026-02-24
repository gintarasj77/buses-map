import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server.js'

describe('API proxy routes', () => {
  let server: Server
  let baseUrl = ''
  const fetchMock = vi.fn()

  beforeEach(async () => {
    fetchMock.mockReset()
    const app = createApp({ fetchImpl: fetchMock as unknown as typeof fetch })
    server = app.listen(0)
    await new Promise<void>((resolve) => {
      server.on('listening', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
  })

  it('proxies /api/gps and forwards conditional request headers', async () => {
    fetchMock.mockResolvedValue(
      new Response('gps-body', {
        status: 200,
        headers: {
          etag: '"upstream-etag"',
          'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT',
          'content-type': 'text/plain; charset=utf-8',
        },
      }),
    )

    const response = await fetch(`${baseUrl}/api/gps`, {
      headers: {
        'if-none-match': '"client-etag"',
        'if-modified-since': 'Mon, 01 Jan 2024 00:00:00 GMT',
      },
    })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('gps-body')
    expect(response.headers.get('etag')).toBe('"upstream-etag"')
    expect(response.headers.get('last-modified')).toBe(
      'Mon, 01 Jan 2024 00:00:00 GMT',
    )
    expect(response.headers.get('content-type')).toContain('text/plain')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers?: Record<string, string> },
    ]
    expect(url).toBe('https://www.stops.lt/vilnius/gps.txt')
    expect(init.headers?.['If-None-Match']).toBe('"client-etag"')
    expect(init.headers?.['If-Modified-Since']).toBe(
      'Mon, 01 Jan 2024 00:00:00 GMT',
    )
  })

  it('returns 304 from /api/gps when upstream is not modified', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }))

    const response = await fetch(`${baseUrl}/api/gps`)

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  it('passes through upstream error status/body for /api/gps', async () => {
    fetchMock.mockResolvedValue(new Response('upstream unavailable', { status: 503 }))

    const response = await fetch(`${baseUrl}/api/gps`)

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('upstream unavailable')
  })

  it('returns route body from /api/route', async () => {
    fetchMock.mockResolvedValue(new Response('route-body', { status: 200 }))

    const response = await fetch(`${baseUrl}/api/route`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('route-body')
    expect(response.headers.get('content-type')).toContain('text/plain')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.stops.lt/vilnius/vilnius/vilnius_bus_117.txt',
    )
  })

  it('returns 502 when upstream fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const gpsResponse = await fetch(`${baseUrl}/api/gps`)
    expect(gpsResponse.status).toBe(502)
    expect(await gpsResponse.text()).toBe('Proxy error')

    const routeResponse = await fetch(`${baseUrl}/api/route`)
    expect(routeResponse.status).toBe(502)
    expect(await routeResponse.text()).toBe('Proxy error')
  })
})
