# Vilnius Bus 117 Live Tracker

Real-time tracker focused on one route only: Vilnius Bus 117.

## Features

- Live GPS updates every 3 seconds for route `117`
- Two route directions: `Pilaitė -> Platiniškės` and reverse
- Interactive map with street and satellite layers
- Material-inspired dark UI
- Responsive layout for desktop and mobile

## Tech Stack

- Frontend: React 19, TypeScript, Vite, React Leaflet
- Backend: Express production proxy
- Data source: `https://www.stops.lt/vilnius/gps.txt`

## Development

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Start dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`.

## Production

### Build

```bash
npm run build
```

### Serve build

```bash
npm run serve
```

Server runs at `http://localhost:4173` (or `PORT` env var).

## API

- `GET /api/gps`: proxy to live GPS feed
- `GET /api/route`: proxy to Bus 117 route polyline file

## CI

GitHub Actions workflow runs:

- `npm ci`
- `npm run lint`
- `npm run build`

## Project Structure

```text
buses-map/
  src/
    App.tsx
    App.css
    index.css
    main.tsx
  server.js
  vite.config.ts
  package.json
```

## License

MIT
