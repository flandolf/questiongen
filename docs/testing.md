**Testing, Linting, and CI**

Tests:
- Frontend unit tests use Vitest. Run with `bun run test` or `npm run test`.
- Native tests: `cd src-tauri && cargo test`.
- Test setup: `src/test/setup.ts`.

Run frontend tests (examples):

```bash
# run all tests
bun run test

# run a single file
bun run vitest src/lib/__tests__/math-normalization.test.ts
```

Quick links:
- Test setup: [src/test/setup.ts](src/test/setup.ts#L1)
- Lib tests: [src/lib/__tests__](src/lib/__tests__#L1)

Example Vitest test snippet:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeMath } from '../../src/lib/math-normalization'

describe('normalizeMath', () => {
	it('normalizes simple LaTeX', () => {
		expect(normalizeMath('\\frac{1}{2}')).toContain('\\frac{1}{2}')
	})
})
```

Linting & Formatting:
- ESLint config at `eslint.config.mjs`.
- Pre-commit hooks available in `scripts/pre-commit.sh`.

CI:
- Refer to repo CI configuration (not included here). Local verification: `bun run lint && bun run typecheck`.
