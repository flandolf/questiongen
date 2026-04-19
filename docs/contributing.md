**Contributing & Coding Guidelines**

Standards:
- Follow existing TypeScript and Rust styles in the repository.
- Add unit tests for new logic; update docs when APIs change.

Example: commit workflow

```bash
# run formatting and lint
bun run format || npm run format
bun run lint

# run tests
bun run test

# commit and push
git add -A
git commit -m "feat: describe change"
git push origin HEAD
```

Pre-commit & CI:
- Run `scripts/pre-commit.sh` before committing locally.
- Ensure `bun run lint && bun run typecheck` passes.

Quick links:
- Lint config: [eslint.config.mjs](eslint.config.mjs#L1)
- Pre-commit hook: [scripts/pre-commit.sh](scripts/pre-commit.sh#L1)
- CI scripts: see `package.json` scripts and `vitest.config.ts`

Pull requests:
- Keep PRs small and focused.
- Link to related issues and include testing instructions.

Communication:
- Update `docs/` when making cross-cutting changes (schemas, store shape, or generation flow).
