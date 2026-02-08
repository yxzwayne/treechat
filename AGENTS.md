# Repository Guidelines

TreeChat is a minimal branching chat UI with a React/TypeScript client and an Express/TypeScript server (streaming model responses, backed by Postgres).

## Essentials

- Use `npm` in `client/` and `server/` (each has its own `package-lock.json`; prefer `npm ci`).
- Build/dev commands: `docs/BUILD.md`
- TypeScript + code style notes: `docs/TYPESCRIPT.md`
- Testing approach (including bugfix workflow): `docs/TESTING.md`
- Env/DB configuration: `docs/CONFIG.md`
- Commit/PR expectations: `docs/CONTRIBUTING.md`

## Bug Reports

When I report a bug, don't start by trying to fix it. Instead, start by writing a test that reproduces the bug. Then, have subagents try to fix the bug and prove it with a passing test.
