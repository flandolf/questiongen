**Core Libraries (src/lib) Guide**

Key responsibilities:

- [src/lib/generation-orchestrator.ts](src/lib/generation-orchestrator.ts#L1) / [src/lib/generator-batch.ts](src/lib/generator-batch.ts#L1) / [src/lib/generator-helpers.ts](src/lib/generator-helpers.ts#L1) — Frontend orchestration for batched generation, retry logic, and prompt construction.
- [src/lib/math-normalization.ts](src/lib/math-normalization.ts#L1) — LaTeX and math normalization for consistent rendering and schema validation.
- [src/lib/token-estimation.ts](src/lib/token-estimation.ts#L1) — Estimating token usage for prompts and batching.
- [src/lib/persistence.ts](src/lib/persistence.ts#L1) / [src/lib/firebase-storage.ts](src/lib/firebase-storage.ts#L1) — Local and cloud persistence helpers.
- [src/lib/question-cache.ts](src/lib/question-cache.ts#L1) — Cache layer for generated questions.
- [src/lib/sketchpad-renderer.ts](src/lib/sketchpad-renderer.ts#L1) / [src/components/sketchpadUtils.ts](src/components/sketchpadUtils.ts#L1) — Sketchpad rendering and utilities.

Developer notes:
- Core logic is covered by unit tests in [src/lib/__tests__](src/lib/__tests__#L1).
- Keep generator prompt logic and schema expectations in sync with [src-tauri/src/schemas.rs](src-tauri/src/schemas.rs#L1).

Example: calling generator orchestration

```ts
// src/lib/generation-orchestrator.ts (usage)
import { generateBatch } from './generator-batch'
const result = await generateBatch({subject: 'math', count: 5, model: 'gpt-4o'})
console.log(result)
```

Example: math normalization

```ts
import { normalizeMath } from './math-normalization'
const cleaned = normalizeMath('\\frac{1}{2} x^2')
```
