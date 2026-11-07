# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run start          # Frontend dev server (Vite, port 3000)
npm run start:server   # Backend Express server (port 3001 or Railway PORT)
npm run dev:server     # Backend with hot-reload (tsx watch, same runtime as production)
npm run typecheck      # Type-check frontend and backend (tsx in dev/prod never checks types)
npm run build          # Production build → /build (type-checks the frontend first)
npm run serve          # Preview production build locally
npm run build:transit-data  # Regenerate src/models/data/ stops, routes and shapes from the GTFS feed in data/google_transit/
npm test               # Backend tests (test/*.test.ts, node:test via tsx)

# SMS service (run inside services/sms, which has its own package.json)
npm start              # Start the service (port 3002 or Railway PORT)
npm test               # Its tests
npm run build:timetable  # Rebuild data/timetable.json from data/google_transit/ (commit the result)
```

No lint scripts are configured.

### Deploy checks (no GitHub Actions)

The deploys check themselves, so a failing change never goes live:
- **Railway (API, `railway.json`; SMS service, `services/sms/railway.json`):** the build command runs `npm run typecheck` and `npm test`; any failure fails the build and the running version stays up. The API also has a health check on `/api/status`.
- **Vercel:** `npm run build` type-checks the frontend before building.

Railway builds run with the live service's settings, so tests must never reach real services: `test/security.test.ts` clears every app setting before it starts, and the SMS tests replace them with fakes (`services/sms/test/fakes.ts`).

### Before committing or building (Claude: always do this)

Run the same checks the deploys run, so a change that would fail the deploy is caught here first:

1. **Dependencies:** run `npm ci` (in the repo root, and in `services/sms` if working there) when `package-lock.json` changed (after a pull, a merge, or adding/removing a package) or when `node_modules` is missing. Not on every build: it deletes and reinstalls `node_modules`.
2. **Main app:** `npm run typecheck` and `npm test` in the repo root.
3. **SMS service** (only if `services/sms/` changed): `npm run typecheck` and `npm test` inside `services/sms`.
4. **Frontend build** (only if something under `src/views`, `src/controllers`, styling, `index.html`, `vite.config.ts` or `scripts/prerender.tsx` changed): `npm run build`.

Don't commit while any of these fail; fix the cause, or tell the user what fails and why.

## Architecture

This is a full-stack real-time transit tracking app for Regina, Saskatchewan. The frontend is React 19 + TypeScript + Vite; the backend is Express 5 + TypeScript. Both run separately in dev and are deployed independently (Railway for backend, Vercel for frontend).

**Strict MVC pattern** — every feature is split across three directories:

```
src/
├── models/       # Data layer: services, repositories, types, static data, Supabase clients
├── views/        # UI layer: React components (pure rendering, no business logic)
└── controllers/  # Orchestration layer: custom React hooks (frontend) + Express routes (backend)
```

### Data flow

User action → View component → Controller hook (`useXxxController`) → Model service → Repository/external API → state update → re-render.

Views must not call services or repositories directly. Services must not import from views or controllers.

### Key services (`src/models/services/`)

| Service | Responsibility |
|---|---|
| `RealTimeService.ts` | Polls transitlive.com every 1.5s for live bus positions |
| `RoutePlanningService.ts` | Multi-leg trip planning with transfers (complex, ~37KB) |
| `StopPredictionService.ts` | Real-time arrival time predictions |
| `TransitService.ts` | Route/stop CRUD with admin overrides |
| `AuthService.ts` | Login/signup via Supabase |
| `AnalyticsService.ts` | Visitor & feature usage tracking |

### Backend (`src/server.ts` + `src/controllers/routes/`)

Express server with three route groups mounted:
- `/api` — transit data (routes, stops, live buses, predictions, admin overrides)
- `/api/analytics` — visitor & feature tracking beacons
- Middleware: `visitorTracker`, `featureTracker`

`TransitController.ts` contains all handler implementations; route files just wire up paths to handlers.

### SMS alert service (`services/sms/`)

A separate Node service with its own deployment (Railway, root `services/sms`), dependencies and tests, so a failure there can't take down the main API and vice versa. It plans riders' saved commutes (`weekly_schedules`) on its own GTFS timetable (`data/timetable.json`), tracks the live buses, and texts through Twilio. Its tables live in the Supabase schema `sms` (script: `docs/security/sms_001_schema.sql`). It must never import from `src/`. The main API only talks to it through `/internal/*` (with `SMS_SERVICE_TOKEN`) and reads its heartbeat for `SmsOutageService` (outage emails to riders). See `services/sms/README.md`.

### Auth & roles

Supabase handles auth. `AuthContext.tsx` exposes `isAuthenticated` and user role globally. Admin routes/views are role-protected. Two Supabase clients exist: `src/models/lib/supabase.ts` (browser, uses `VITE_*` env vars) and `src/models/lib/supabaseServer.ts` (backend).

### Environment variables

Frontend (prefix `VITE_`): `VITE_GOOGLE_MAPS_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`  
Backend (no prefix): `TRANSIT_LIVE_API_URL`, `PORT`, Supabase service-role key

### Maps

`@react-google-maps/api` renders the map. `use-places-autocomplete` powers address search. Live bus positions, route shapes, and stop markers are layered as Google Maps overlays managed in `useMapController.ts`.

### Styling

TailwindCSS 3 with a custom green palette (primary `#2E7D32`). Custom font: Inter. No CSS modules — all styling via Tailwind utility classes.
