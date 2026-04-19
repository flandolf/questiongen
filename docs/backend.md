**Backend / Tauri (src-tauri) Guide**

Summary: Native Rust code provides JSON schema validation, prompt processing,
parsing, PDF/Anki export, and integrations (OpenRouter). Key files:

- [src-tauri/src/main.rs](src-tauri/src/main.rs#L1) — Tauri command registration
  and bridge to frontend.
- [src-tauri/src/lib.rs](src-tauri/src/lib.rs#L1) — Core native helpers and
  Tauri command implementations.
- [src-tauri/src/generation.rs](src-tauri/src/generation.rs#L1) — Main
  generation execution and orchestration.
- [src-tauri/src/schemas.rs](src-tauri/src/schemas.rs#L1) — JSON schema
  definitions used to validate AI outputs.
- [src-tauri/src/parsing.rs](src-tauri/src/parsing.rs#L1),
  [src-tauri/src/text_clean.rs](src-tauri/src/text_clean.rs#L1),
  [src-tauri/src/normalization.rs](src-tauri/src/normalization.rs#L1) — Parsing
  and normalization utilities.
- [src-tauri/src/pdf.rs](src-tauri/src/pdf.rs#L1),
  [src-tauri/src/anki.rs](src-tauri/src/anki.rs#L1) — Export helpers.

Developer notes:

- Run native tests: `cd src-tauri && cargo test`.
- Inspect schemas in [src-tauri/src/schemas.rs](src-tauri/src/schemas.rs#L1)
  before changing frontend expectations.

Quick example: run the native test suite

```bash
cd src-tauri
cargo test -- --nocapture
```

Example: Tauri command usage from frontend

```ts
// call native command exposed in src-tauri/src/lib.rs
import { invoke } from '@tauri-apps/api/tauri';
const res = await invoke('generate_questions', { payload: myPayload });
```
