# Configuration (Env + DB)

The server loads environment variables via `dotenv` (put secrets in `server/.env`, which is gitignored).

Common variables:

- `DATABASE_URL` (defaults to `postgres://localhost:5432/treechat`)
- `OPENROUTER_API_KEY` (preferred) or `OPENAI_API_KEY`
- `OPENROUTER_BASE_URL` (defaults to OpenRouter)
- `OPENROUTER_SITE_URL`, `OPENROUTER_APP_NAME` (attribution headers)
- `USE_MOCK=1` (run without network; stream a local mock response)
- `PORT` (defaults to `8787`)

OpenRouter troubleshooting:
- If you see `404: No allowed providers are available for the selected model`, your OpenRouter API key is usually restricted to an allowlist of providers that doesn't include any provider serving that model.

Database notes:
- Server bootstraps schema on startup and requires `pgcrypto` (for `gen_random_uuid()`); ensure your Postgres role can `CREATE EXTENSION` or install it ahead of time.
