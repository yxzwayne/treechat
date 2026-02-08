# Docker

TreeChat can run as:

- one **app** container (Express API + built UI), plus
- one **Postgres** container (official `postgres` image).

Bundling Postgres into the same container is possible but not recommended (harder upgrades/backups; nonstandard lifecycle).

## Local run (build from source)

From the repo root:

- `docker compose up --build`

Then open:

- http://localhost:8787

Defaults:

- DB is created automatically (`treechat`).
- Schema is bootstrapped automatically by the server on startup.
- `USE_MOCK=1` is enabled by default (no API key required).

To run with real model calls, set `USE_MOCK=0` and pass an API key:

- `USE_MOCK=0 OPENROUTER_API_KEY=... docker compose up --build`

If port 8787 is busy, pick another host port:

- `HOST_PORT=8788 docker compose up --build`

## “One command” run (pull prebuilt image)

To support `curl … | docker compose -f - up`, you must publish an app image somewhere (Docker Hub/GHCR/etc.).

This repo includes `docker-compose.pull.yml` which is intended to be fetched and piped into `docker compose`:

- `curl -fsSL https://raw.githubusercontent.com/yxzwayne/treechat/refs/heads/main/docker-compose.pull.yml | docker compose -f - up -d --pull always`

After it finishes, open:

- http://localhost:8787

To enable real model calls, set `USE_MOCK=0` and pass either `OPENROUTER_API_KEY` or `OPENAI_API_KEY` to the `docker compose` command:

- `curl -fsSL https://raw.githubusercontent.com/yxzwayne/treechat/refs/heads/main/docker-compose.pull.yml | USE_MOCK=0 OPENROUTER_API_KEY=... docker compose -f - up -d --pull always`
