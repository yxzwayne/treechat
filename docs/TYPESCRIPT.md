# TypeScript Conventions

- TypeScript is `strict` in both packages; keep types tight and avoid broad `any`.
- Both packages use ESM (`"type": "module"`): prefer `import`/`export` and avoid `require`.
- No formatter/linter is enforced; keep diffs small and match existing style (2-space indentation).
- Naming: React components `PascalCase.tsx`; variables/functions `camelCase`; types `PascalCase`.
