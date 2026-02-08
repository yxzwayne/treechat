# Testing

There is no committed test runner yet.

- For bug reports: add a failing regression test (or minimal reproducible check) first, then fix until it passes.
- Treat `npm run build` as the default correctness gate for both `client/` and `server/`.
- If you introduce a test harness (Vitest/Jest/etc.), standardize on a single command (for example `npm test`) and consistent filenames (`*.test.ts(x)`), then document it in `README.md`.
