import express from 'express'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4173
const TARGET_URL = 'https://www.stops.lt/vilnius/gps.txt'
const ROUTE_URL = 'https://www.stops.lt/vilnius/vilnius/vilnius_bus_117.txt'
const DEFAULT_UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000)
const DEFAULT_UPSTREAM_RETRIES = Number(process.env.UPSTREAM_RETRIES || 1)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504])

class UpstreamTimeoutError extends Error {
  constructor(message) {
    super(message)
    this.name = 'UpstreamTimeoutError'
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isAbortError(error) {
  return Boolean(error && typeof error === 'object' && error.name === 'AbortError')
}

async function fetchWithRetries({
  fetchImpl,
  url,
  init = {},
  timeoutMs,
  retries,
}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal })
      clearTimeout(timeoutId)

      if (!RETRYABLE_STATUS_CODES.has(response.status) || attempt === retries) {
        return response
      }
    } catch (error) {
      clearTimeout(timeoutId)
      lastError = isAbortError(error)
        ? new UpstreamTimeoutError(`Upstream timeout after ${timeoutMs}ms`)
        : error
      if (attempt === retries) {
        throw lastError
      }
    }

    const backoffMs = 200 * (attempt + 1)
    await sleep(backoffMs)
  }

  if (lastError) {
    throw lastError
  }
  throw new Error('Upstream request failed')
}

export function createApp({
  fetchImpl = fetch,
  upstreamTimeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS,
  upstreamRetries = DEFAULT_UPSTREAM_RETRIES,
} = {}) {
  const app = express()

  app.get('/api/gps', async (req, res) => {
    try {
      const upstream = await fetchWithRetries({
        fetchImpl,
        url: TARGET_URL,
        timeoutMs: upstreamTimeoutMs,
        retries: upstreamRetries,
        init: {
          headers: {
            ...(req.header('if-none-match') ? { 'If-None-Match': req.header('if-none-match') } : {}),
            ...(req.header('if-modified-since')
              ? { 'If-Modified-Since': req.header('if-modified-since') }
              : {}),
          },
        },
      })

      if (upstream.status === 304) {
        res.status(304).end()
        return
      }

      if (!upstream.ok) {
        const text = await upstream.text()
        res.status(upstream.status).send(text)
        return
      }

      const body = await upstream.text()
      const etag = upstream.headers.get('etag')
      const lastModified = upstream.headers.get('last-modified')
      const contentType = upstream.headers.get('content-type') || 'text/plain'

      if (etag) res.set('etag', etag)
      if (lastModified) res.set('last-modified', lastModified)
      res.set('content-type', contentType)
      res.send(body)
    } catch (err) {
      if (err instanceof UpstreamTimeoutError) {
        res.status(504).send('Upstream timeout')
        return
      }
      res.status(502).send('Proxy error')
    }
  })

  app.get('/api/route', async (_, res) => {
    try {
      const upstream = await fetchWithRetries({
        fetchImpl,
        url: ROUTE_URL,
        timeoutMs: upstreamTimeoutMs,
        retries: upstreamRetries,
      })
      if (!upstream.ok) {
        res.status(upstream.status).send('Failed to fetch route')
        return
      }
      const body = await upstream.text()
      res.set('content-type', 'text/plain')
      res.send(body)
    } catch (err) {
      if (err instanceof UpstreamTimeoutError) {
        res.status(504).send('Upstream timeout')
        return
      }
      res.status(502).send('Proxy error')
    }
  })

  app.use(express.static(path.join(__dirname, 'dist')))

  app.get('*', (_, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })

  return app
}

export function startServer(port = PORT) {
  const app = createApp()
  return app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`)
  })
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntryPoint) {
  startServer()
}
