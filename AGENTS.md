# Repository Guidelines

## Project Structure & Module Organization
- `client/`: Vite + React + TypeScript UI (components in `src/components/`, app entry `src/main.tsx`, styles in `src/styles.css`, assets in `assets/`).
- `server/`: Express + TypeScript API (`src/index.ts`, DB helpers in `src/pg.ts`, model list in `src/models.ts`). Emits `dist/` on build.
- `aws-sdk-sample-code/`: Reference examples only; not used by the app.

## Build, Test, and Development Commands
- Client dev: `cd client && npm i && npm run dev` (runs Vite on `5173`, proxies `/api` to `8787`).
- Client build/preview: `npm run build` then `npm run preview`.
- Server dev: `cd server && npm i && npm run dev` (hot reload via `tsx`).
- Server build/start: `npm run build` then `npm start` (runs `dist/index.js`).
- Health check: `curl http://localhost:8787/health`.

## Coding Style & Naming Conventions
- TypeScript, ES modules, strict mode (`tsconfig`). Indent 2 spaces.
- React components: PascalCase files (e.g., `MessageNode.tsx`); functions/vars camelCase.
- Keep UI state in `client/src/state.ts`; colocate small helpers under `client/src/lib/`.
- No linters configured; match existing style. Use lightweight, pure functions and avoid side effects in React components.

## Testing Guidelines
- No test runner is configured yet. Prefer adding:
  - Client: Vitest + React Testing Library.
  - Server: Jest or Vitest + Supertest.
- Name tests alongside sources: `foo.ts` → `foo.test.ts`. Run with `npm test` once added.

## Commit & Pull Request Guidelines
- Commits: short, imperative subject; optional scope prefix (`feat:`, `fix:`, `chore:`). Example: `fix(ui): correct branch spacing`.
- PRs must include: problem statement, summary of changes, screenshots/GIFs for UI, local test plan, and any config notes.
- Link issues where applicable. Keep PRs focused and small.

## Security & Configuration Tips
- Server env (`server/.env`):
  - `OPENROUTER_API_KEY` or `OPENAI_API_KEY`
  - `OPENROUTER_BASE_URL` (default `https://openrouter.ai/api/v1`), `MODEL`
  - `DATABASE_URL` (default `postgres://localhost:5432/treechat`)
  - `USE_MOCK=1` to stream local echo without network
- DB schema is auto-ensured on boot; ensure PostgreSQL is running before the server.
