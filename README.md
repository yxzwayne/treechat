# TreeChat CC — Branching Chat UI

## Overview

This is a minimal React + TypeScript app that renders full branching conversation trees: user edits and assistant retries create sibling branches that are preserved and displayed side-by-side. A tiny Node/Express proxy streams responses from OpenAI so the API key is never exposed to the browser.

## What’s inside

- client: Vite + React + TypeScript UI that renders a conversation tree, supports retries, user edits, and selecting any leaf to continue the branch.
- server: Express + OpenAI SDK proxy endpoint streaming assistant deltas.

## Quick start

1) Install deps
   - client: `cd client && npm i`
   - server: `cd server && npm i`

2) Configure env
   - In `server/.env` set `OPENAI_API_KEY=your_key`
   - Optional: USE_MOCK=1 to use a local mocked streaming model

3) Run
   - server: `npm run dev` (default port 8787)
   - client: `npm run dev` (Vite dev server on 5173; proxied to http://localhost:8787)

4) Use
   - Type in the chat box while a leaf node is selected. The assistant response streams in as a new child under that leaf.
   - Click Retry on a user message to generate a sibling assistant answer; all branches remain visible.
   - Click Edit on a user message to create a branched edit and continue from there.

### Notes

- Model is set to `gpt-5-mini` by default. Change via SERVER env MODEL or client UI as needed.
- If you can’t install dependencies now, you can still read the code. It’s kept minimal and self-explanatory.

# Developer Notes

## Switching between OpenAI and OpenRouter

The server uses the official OpenAI SDK and can talk to either OpenAI or OpenRouter by configuration only. No client changes are required.

Default behavior: the server targets OpenRouter. It reads `OPENROUTER_API_KEY` and uses `https://openrouter.ai/api/v1` as the base URL. The default model fallback is `openai/gpt-5-mini`.

## Use OpenRouter

1) In `server/.env`, set:

```
OPENROUTER_API_KEY=sk-or-...
# optional, overrides base and attribution metadata
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=TreeChat CC
# model: keep provider prefix on OpenRouter
MODEL=openai/gpt-5-mini
```

Use OpenAI (canonical API)

Because the server defaults to OpenRouter, point the SDK back to OpenAI by overriding the base URL and providing an OpenAI key. The extra OpenRouter headers are harmless if present.

```
OPENAI_API_KEY=sk-...
OPENROUTER_BASE_URL=https://api.openai.com/v1
# IMPORTANT: use an OpenAI model id without provider prefix
MODEL=gpt-4o-mini
```

Notes

- Precedence: the server prefers `OPENROUTER_API_KEY` when present; otherwise it falls back to `OPENAI_API_KEY`.
- Model naming: OpenRouter accepts provider-prefixed names like `openai/gpt-5-mini`. OpenAI expects canonical names like `gpt-4o-mini`. Adjust `MODEL` accordingly, or pass `model` in the request body.
- Mock mode: set `USE_MOCK=1` to bypass any network and stream a local echo response.


# TODO

- Centralize default system prompt: Move the default prompt to the server as a single source of truth. Options: (a) env var `DEFAULT_SYSTEM_PROMPT` read by the server; or (b) a small `GET /api/defaults` returning `{ systemPrompt }`. The client fetches it on app boot and seeds the root system node; the server uses the same value when synthesizing a missing root on load. Keep the current client-side prompt as a fallback if the fetch/env is absent.
- Image/file support: Allow uploading and rendering images/files in messages, and forwarding them to the model when supported. Include persistence in Postgres (blob storage path or presigned URL), display thumbnails, and drag-and-drop paste handling on the Composer.