# Vilnius Bus 117 Live Tracker

Single-route real-time tracker for Vilnius Bus `117`.

## Overview

This app renders live Bus 117 vehicle positions on a map, overlays both route
directions, and updates on a polling loop with smooth marker animation.

## Features

- Live GPS polling every 3 seconds
- Route direction toggle: `Pilait&#279; -> Platini&#353;k&#279;s` and reverse
- Street and satellite map layers
- Empty-feed and stale-data UI states
- Material-inspired dark theme
- Responsive desktop/mobile layout

## Stack

- Frontend: React 19, TypeScript, Vite, React Leaflet
- Backend: Express proxy server
- Data source: `https://www.stops.lt/vilnius/gps.txt`
- Tests: Vitest

## Prerequisites

- Node.js `20.x` to `25.x`
- npm

## Quick Start

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

App URL: `http://localhost:5173`
Live URL: `https://bus-117-tracker.onrender.com/`

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server |
| `npm run test` | Run unit tests |
| `npm run test:e2e` | Run Playwright smoke test |
| `npm run lint` | Run ESLint |
| `npm run build` | Build production bundle |
| `npm run serve` | Serve production build via Express |

## Production

Build:

```bash
npm run build
```

Serve:

```bash
npm run serve
```

Server URL: `http://localhost:4173` (or `PORT` env var).

Additional server env vars:

- `UPSTREAM_TIMEOUT_MS` (default: `8000`)
- `UPSTREAM_RETRIES` (default: `1`)

## API

- `GET /api/gps`
  - Proxies live GPS feed
  - Supports conditional headers (`If-None-Match`, `If-Modified-Since`)
  - Returns passthrough `ETag` and `Last-Modified` when provided upstream
- `GET /api/route`
  - Proxies Bus 117 polyline file

## Observability

- API responses include `x-request-id` for request correlation.
- Server logs are structured JSON and include:
  - request start/finish
  - upstream retry attempts
  - upstream timeout/proxy errors

## Testing

Run tests locally:

```bash
npm run test
```

Covered behavior includes:

- Polyline decoding
- GPS feed parsing
- Backend proxy success/error handling with mocked upstream fetch
- Browser smoke flow (app load, map render, API responses)

## CI

GitHub Actions workflow runs:

- `npm ci`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

## Releases

- Changelog: `CHANGELOG.md`
- Process checklist: `RELEASE_CHECKLIST.md`

## Project Structure

```text
buses-map/
  src/
    App.tsx
    App.css
    index.css
    lib/transit.ts
    main.tsx
  tests/
    transit.test.ts
    server.test.ts
  server.js
  vite.config.ts
  package.json
```

## Troubleshooting

- `ERR_BLOCKED_BY_CLIENT` for analytics: tracking scripts were removed from
  `index.html`; if seen in old tabs, hard refresh.
- No buses visible: feed can temporarily return no vehicles for route `117`.
- Stale data banner: upstream data has not refreshed yet; app retries
  automatically.

## License

MIT
