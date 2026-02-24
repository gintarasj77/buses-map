import express from 'express'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4173
const TARGET_URL = 'https://www.stops.lt/vilnius/gps.txt'
const ROUTE_URL = 'https://www.stops.lt/vilnius/vilnius/vilnius_bus_117.txt'

export function createApp({ fetchImpl = fetch } = {}) {
  const app = express()

  app.get('/api/gps', async (req, res) => {
    try {
      const upstream = await fetchImpl(TARGET_URL, {
        headers: {
          ...(req.header('if-none-match') ? { 'If-None-Match': req.header('if-none-match') } : {}),
          ...(req.header('if-modified-since')
            ? { 'If-Modified-Since': req.header('if-modified-since') }
            : {}),
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
      res.status(502).send('Proxy error')
    }
  })

  app.get('/api/route', async (_, res) => {
    try {
      const upstream = await fetchImpl(ROUTE_URL)
      if (!upstream.ok) {
        res.status(upstream.status).send('Failed to fetch route')
        return
      }
      const body = await upstream.text()
      res.set('content-type', 'text/plain')
      res.send(body)
    } catch (err) {
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
