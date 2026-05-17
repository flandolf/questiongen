# QuestionGen Agent Guide

## High-Signal Context

- **Frameworks**: Tauri 2 (Rust) + React 19 (Vite, TS, Tailwind 4).
- **Domain**: VCE (Victorian Certificate of Education) exam question generation.
- **AI**: OpenRouter for generation/marking.
- **State**: Zustand (slices pattern) in `src/store/`. `src/store.ts` is the
  aggregate entry point.
- **Math Architecture**: MathJax 4 for rendering.
  - **Shielding**: Frontend uses `shieldMathForMarkdown`
    (`src/lib/math-normalization.ts`) to replace `$..$` with tokens before
    markdown parsing.
  - **Protection**: Backend Rust (`src-tauri/src/parsing.rs`) uses
    `protect_latex_in_raw_json` to prevent JSON escapes (e.g., `\f` in `\frac`)
    from mangling LaTeX before `serde_json` parsing.
  - **Cleaning**: `clean_field` in Rust normalizes delimiters and repairs LLM
    LaTeX errors (e.g., `\fty` -> `\infty`).

## Critical Commands

- **Frontend Check**: `bun run lint && bun run typecheck`
- **Backend Tests**: `cd src-tauri && cargo test` (Crucial for LaTeX protection
  logic).
- **Dev**: `bun tauri dev` (Starts desktop app).

## Architecture & Entrypoints

- **Tauri Bridge**: Commands in `src-tauri/src/lib.rs`. Main generation service
  in `src-tauri/src/generation.rs`.
- **Generation Orchestration**: `src/lib/generator-batch.ts` (Batching/Variety
  logic).
- **Styling**: Tailwind 4 (CSS-first). Global styles and theme imports in
  `src/themes/index.css`.
- **Fonts**: Spline Sans Variable (interface), JetBrains Mono Variable
  (technical).

## Quirks & Constraints

- **Lockfiles**: `bun.lock` exists. ALWAYS use `bun` for package operations.
- **PDFs**: `exams/` and `reports/` are reference directories (excluded from
  git).
- **Anki**: Native `.apkg` generation via `genanki-rs` in
  `src-tauri/src/anki.rs`.
- **Firebase**: Sync logic in `src/context/FirebaseSyncContext.tsx`. Matches
  `firestore.rules`.
