# Build & Development

This repo contains two npm packages: `client/` (Vite + React) and `server/` (Express API).

## Install

- `cd client && npm ci`
- `cd server && npm ci`

## Local Development

Run both in separate terminals:

- Server: `cd server && npm run dev` (defaults to `PORT=8787`)
- Client: `cd client && npm run dev` (defaults to `5173`; dev proxy forwards `/api/*` to the server)

## Production Build / Smoke Check

- `cd server && npm run build && npm start`
- `cd client && npm run build && npm run preview`

Notes:
- Use a recent Node.js (the server uses `fetch`; Node 18+ is a safe baseline).
