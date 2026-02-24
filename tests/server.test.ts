import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../server.js'

describe('API proxy routes', () => {
  let server: Server | undefined
  const fetchMock = vi.fn()

  async function startTestServer({
    upstreamRetries = 0,
    upstreamTimeoutMs = 500,
  }: {
    upstreamRetries?: number
    upstreamTimeoutMs?: number
  } = {}) {
    fetchMock.mockReset()
    const app = createApp({
      fetchImpl: fetchMock as unknown as typeof fetch,
      upstreamRetries,
      upstreamTimeoutMs,
      logger: () => {},
    })
    server = app.listen(0)
    await new Promise<void>((resolve) => {
      server?.on('listening', () => resolve())
    })
    const address = server.address() as AddressInfo
    return `http://127.0.0.1:${address.port}`
  }

  afterEach(async () => {
    if (!server) return
    await new Promise<void>((resolve, reject) => {
      server?.close((err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      })
    })
    server = undefined
  })

  it('proxies /api/gps and forwards conditional request headers', async () => {
    const baseUrl = await startTestServer()
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
    expect(response.headers.get('x-request-id')).toBeTruthy()

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
    const baseUrl = await startTestServer()
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }))

    const response = await fetch(`${baseUrl}/api/gps`)

    expect(response.status).toBe(304)
    expect(await response.text()).toBe('')
  })

  it('passes through upstream error status/body for /api/gps', async () => {
    const baseUrl = await startTestServer()
    fetchMock.mockResolvedValue(
      new Response('upstream unavailable', { status: 503 }),
    )

    const response = await fetch(`${baseUrl}/api/gps`)

    expect(response.status).toBe(503)
    expect(await response.text()).toBe('upstream unavailable')
  })

  it('retries /api/gps on transient upstream status and succeeds', async () => {
    const baseUrl = await startTestServer({ upstreamRetries: 1 })
    fetchMock
      .mockResolvedValueOnce(new Response('temporary issue', { status: 503 }))
      .mockResolvedValueOnce(new Response('gps-recovered', { status: 200 }))

    const response = await fetch(`${baseUrl}/api/gps`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('gps-recovered')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns route body from /api/route', async () => {
    const baseUrl = await startTestServer()
    fetchMock.mockResolvedValue(new Response('route-body', { status: 200 }))

    const response = await fetch(`${baseUrl}/api/route`)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('route-body')
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('x-request-id')).toBeTruthy()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.stops.lt/vilnius/vilnius/vilnius_bus_117.txt',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('returns 502 when upstream fetch throws', async () => {
    const baseUrl = await startTestServer()
    fetchMock.mockRejectedValue(new Error('network down'))

    const gpsResponse = await fetch(`${baseUrl}/api/gps`)
    expect(gpsResponse.status).toBe(502)
    expect(await gpsResponse.text()).toBe('Proxy error')

    const routeResponse = await fetch(`${baseUrl}/api/route`)
    expect(routeResponse.status).toBe(502)
    expect(await routeResponse.text()).toBe('Proxy error')
  })

  it('returns 504 when upstream request times out', async () => {
    const baseUrl = await startTestServer({ upstreamTimeoutMs: 30 })
    fetchMock.mockImplementation((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        })
      })
    })

    const gpsResponse = await fetch(`${baseUrl}/api/gps`)
    expect(gpsResponse.status).toBe(504)
    expect(await gpsResponse.text()).toBe('Upstream timeout')
  })
})
