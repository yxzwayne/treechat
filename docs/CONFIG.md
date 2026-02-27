# Configuration (Env + Storage)

The server loads environment variables via `dotenv` (put secrets in `server/.env`, which is gitignored).

Common variables:

- `TREECHAT_DATA_DIR` (defaults to `~/.treechat/data`)
- `OPENROUTER_API_KEY` (preferred) or `OPENAI_API_KEY`
- `OPENROUTER_BASE_URL` (defaults to OpenRouter)
- `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` (attribution headers)
- `USE_MOCK=1` (run without network; stream a local mock response)
- `PORT` (defaults to `8787`)

Notes:
- If `USE_MOCK` is unset and no API key is configured, the server defaults to mock mode.

OpenRouter troubleshooting:
- If you see `404: No allowed providers are available for the selected model`, your OpenRouter API key is usually restricted to an allowlist of providers that doesn't include any provider serving that model.

Migration (optional):
- If you have an existing Postgres-backed TreeChat database, you can export it into the filesystem store with `cd server && DATABASE_URL=... npm run migrate:pg-to-file`.
- If the destination data dir already exists, pass force via `cd server && DATABASE_URL=... npm run migrate:pg-to-file -- --force`.
