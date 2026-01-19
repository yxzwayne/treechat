# TreeChat — Branching Chat UI

https://github.com/user-attachments/assets/87ed3e76-2909-452c-bc45-37be0396bf60

## Overview

This is a minimal React + TypeScript app that renders full branching conversation trees: user edits and assistant retries create sibling branches that are preserved and displayed side-by-side. This supports retries, user edits, selecting any leaf to continue the branch, and multi-model chats.

## What’s inside

- client: Vite + React + TypeScript UI that renders a conversation tree.
- server: Express + OpenAI SDK proxy endpoint streaming assistant deltas.

## Quick start

1) Install deps
   - client: `cd client && npm i`
   - server: `cd server && npm i`

2) Configure env
   - In `server/.env` set `OPENROUTER_API_KEY=your_key`
   - Optional: USE_MOCK=1 to use a local mocked streaming model

3) Run
   - server: `npm run dev` (default port 8787)
   - client: `npm run dev` (Vite dev server on 5173; proxied to http://localhost:8787)

4) Use
   - Type in the chat box while a leaf node is selected. The assistant response streams in as a new child under that leaf.
   - Click Retry on a user message to generate a sibling assistant answer; all branches remain visible.
   - Click Edit on a user message to create a branched edit and continue from there.

# Developer Notes

## Switching between OpenAI and OpenRouter

The server uses the official OpenAI SDK and can talk to either OpenAI or OpenRouter by configuration only. No client changes are required.

Default behavior: the server targets OpenRouter. It reads `OPENROUTER_API_KEY` and uses `https://openrouter.ai/api/v1` as the base URL.

## Use OpenRouter

1) In `server/.env`, set:

```
OPENROUTER_API_KEY=sk-or-...
# optional, overrides base and attribution metadata
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=Treechat
```

Use OpenAI (canonical API)

Because the server defaults to OpenRouter, point the SDK back to OpenAI by overriding the base URL and providing an OpenAI key. The extra OpenRouter headers are harmless if present.

```
OPENROUTER_API_KEY=sk-...
OPENROUTER_BASE_URL=https://api.openai.com/v1
```

Notes

- Precedence: the server prefers `OPENROUTER_API_KEY` when present; otherwise it falls back to `OPENAI_API_KEY`.
- Mock mode: set `USE_MOCK=1` to bypass any network and stream a local echo response.


# TODO

- Image/file support: Allow uploading and rendering images/files in messages, and forwarding them to the model when supported. Include persistence in Postgres (blob storage path or presigned URL), display thumbnails, and drag-and-drop paste handling on the Composer.
- ⚠️ when user edits a message, provide the option to "override current branch" and clearly notify them that this is a "delete plus create" operation
- **New workflow, automatic conversation summary from the first user message**: this should be a separate workflow that runs like lambda on hardware with access to client, server and database. this workflow is triggered by a user sending the first message in a new conversation. This workflow has a system prompt instructing the model to summarize the following content and appends the user's first prompt. ask the summary to be under 10 words or characters if it's not a Latin language.
