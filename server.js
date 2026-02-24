import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'

const app = express()
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 4173
const TARGET_URL = 'https://www.stops.lt/vilnius/gps.txt'
const ROUTE_URL = 'https://www.stops.lt/vilnius/vilnius/vilnius_bus_117.txt'

app.get('/api/gps', async (req, res) => {
  try {
    const upstream = await fetch(TARGET_URL, {
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
    const upstream = await fetch(ROUTE_URL)
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
