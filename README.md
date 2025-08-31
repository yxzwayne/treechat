TreeChat CC — Branching Chat UI with OpenAI

Overview

This is a minimal React + TypeScript app that renders full branching conversation trees: user edits and assistant retries create sibling branches that are preserved and displayed side-by-side. A tiny Node/Express proxy streams responses from OpenAI so the API key is never exposed to the browser.

What’s inside

- client: Vite + React + TypeScript UI that renders a conversation tree, supports retries, user edits, and selecting any leaf to continue the branch.
- server: Express + OpenAI SDK proxy endpoint streaming assistant deltas.

Quick start

1) Install deps
   - client: cd client && npm i
   - server: cd server && npm i

2) Configure env
   - In server/.env set OPENAI_API_KEY=your_key
   - Optional: USE_MOCK=1 to use a local mocked streaming model

3) Run
   - server: npm run dev (default port 8787)
   - client: npm run dev (Vite dev server on 5173; proxied to http://localhost:8787)

4) Use
   - Type in the chat box while a leaf node is selected. The assistant response streams in as a new child under that leaf.
   - Click Retry on a user message to generate a sibling assistant answer; all branches remain visible.
   - Click Edit on a user message to create a branched edit and continue from there.

Notes

- Model is set to gpt-5-mini by default. Change via SERVER env MODEL or client UI as needed.
- If you can’t install dependencies now, you can still read the code. It’s kept minimal and self-explanatory.
