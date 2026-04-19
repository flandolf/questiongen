**API Schemas & Data Formats**

JSON schemas and data formats are authoritative in the Rust native layer. Keep schema changes coordinated between frontend and native code.

Key locations:
- [src-tauri/src/schemas.rs](src-tauri/src/schemas.rs#L1) — Primary schema definitions used to validate AI-generated outputs.
- [src/types](src/types#L1) — TypeScript interfaces that mirror native schema shapes; keep these in sync.

Developer notes:
- When modifying `schemas.rs`, run native tests and update TypeScript types.
- Use the generator's [src/lib/generation-orchestrator.ts](src/lib/generation-orchestrator.ts#L1) and [src/lib/generator-helpers.ts](src/lib/generator-helpers.ts#L1) to inspect expected shapes.

Example: validate JSON shape (pseudo)

```rs
// in Rust tests or helper
let json = serde_json::from_str::<SchemaRoot>(s).expect("valid")
// run schema validation helper
schemas::validate(&json).unwrap();
```

Corresponding TypeScript example (parsing response):

```ts
import { GeneratedQuestion } from '../src/types/generator'
const parsed: GeneratedQuestion = JSON.parse(resp)
```
