# Vilnius Bus 117 Live Tracker

Real-time tracking application for Vilnius bus route 117 using public GPS data. Built with React, TypeScript, Vite, and Leaflet.

![Bus 117 Tracker](https://img.shields.io/badge/Route-117-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Live-success?style=for-the-badge)

## Features

- 🚌 **Real-time tracking** - Live GPS updates every 3 seconds
- 🗺️ **Interactive map** - Powered by Leaflet with OpenStreetMap tiles
- 🎨 **Modern UI** - Glassmorphism design with smooth animations
- 🛰️ **Satellite view** - Toggle between street map and satellite imagery
- 🔄 **Route direction** - Switch between Pilaitė → Platiniškės and reverse
- 📱 **Responsive** - Works on desktop and mobile devices
- ⚡ **Fast** - Built with Vite and optimized for performance

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Mapping**: Leaflet, React Leaflet
- **Server**: Express (production proxy)
- **Data Source**: [stops.lt](https://www.stops.lt) public GPS feed

## Development

### Prerequisites

- Node.js 18+ and npm

### Install dependencies

```bash
npm install
```

### Run development server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

Development mode uses Vite's proxy to handle CORS with the GPS feed.

## Production

### Build for production

```bash
npm run build
```

This creates an optimized build in the `dist/` directory.

### Serve production build

```bash
npm run serve
```

Starts an Express server on port 4173 (or `PORT` env variable) that:
- Serves the static build from `dist/`
- Proxies `/api/gps` to the stops.lt GPS feed
- Proxies `/api/route/:bus` to fetch route polylines
- Handles ETag/conditional requests for efficient polling

The production server is available at `http://localhost:4173`

## Deployment

The app is deployment-ready for platforms like:

- **Vercel/Netlify** - Use `npm run build` and deploy the `dist/` folder with serverless functions for the API routes
- **Railway/Render** - Deploy with `npm run serve` as the start command
- **Docker** - Create a Dockerfile with Node.js, build the app, and run the Express server
- **VPS** - Clone, build, and run with a process manager like PM2

### Environment Variables

- `PORT` - Server port (default: 4173)

## Project Structure

```
buses-map/
├── src/
│   ├── App.tsx          # Main application component
│   ├── App.css          # Styles with glassmorphism design
│   ├── main.tsx         # React entry point
│   └── vite-env.d.ts    # Vite type definitions
├── server.js            # Production Express server with API proxy
├── vite.config.ts       # Vite configuration with dev proxy
├── package.json         # Dependencies and scripts
└── README.md
```

## API Endpoints

### Development (Vite proxy)
- `GET /api/gps` - Proxies to stops.lt GPS feed
- `GET /api/route/:bus?mode=0` - Proxies to route polyline data

### Production (Express server)
- `GET /api/gps` - GPS feed with ETag caching
- `GET /api/route/:bus?mode=0` - Route polyline with mode support (0=Bus, 1=Trolley)

## Data Source

This app uses the public GPS feed from [stops.lt](https://www.stops.lt/vilnius/gps.txt), which provides real-time location data for Vilnius public transport.

## License

MIT

## Credits

- GPS data: [stops.lt](https://www.stops.lt)
- Map tiles: [OpenStreetMap](https://www.openstreetmap.org)
- Satellite imagery: [ArcGIS World Imagery](https://www.arcgis.com)
