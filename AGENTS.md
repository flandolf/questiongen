# QuestionGen Agent Guide

## High-Signal Context

- **Frameworks**: Tauri 2 (Rust) + React 19 (Vite, TS, Tailwind 4).
- **Domain**: VCE (Victorian Certificate of Education) exam question generation
  (Math Methods, Specialist Math, Chemistry, PE).
- **AI**: OpenRouter for generation/marking. JSON schemas enforced in
  `src-tauri/src/schemas.rs` and `src-tauri/src/lib.rs`.
- **State**: Zustand in `src/store.ts`. Firebase/Firestore for optional sync.
- **Math**: MathJax 4 for rendering mixed Markdown + LaTeX. Core logic in
  `src/lib/math-normalization.ts`.

## Critical Commands
- **Verification Flow**: `bun run lint && bun run typecheck`
- **Backend Tests**: `cd src-tauri && cargo test` (Tests parsing, LaTeX
  normalization, and prompt logic).

## Architecture & Entrypoints

- **Tauri Bridge**: Native commands in `src-tauri/src/lib.rs`. Invoked from TS
  via `@tauri-apps/api`.
- **State Entry**: `src/store.ts` is the source of truth for questions,
  sessions, and user settings.
- **Generation**: `src/lib/generator-batch.ts` (Frontend orchestration) ->
  `src-tauri/src/generation.rs` (Native execution).
- **Styling**: Tailwind 4 via `@tailwindcss/vite`. UI components in
  `src/components/ui/` (shadcn/ui).

## Quirks & Constraints

- **Lockfiles**: Repository contains both `bun.lock`.
  Prefer `bun` for consistency with `package.json` scripts.
- **Tailwind 4**: Configuration is CSS-first (integrated in `src/index.css` via
  `@theme`).
- **PDFs**: `exams/` and `reports/` are for reference PDFs (excluded from git).
  Parsing is handled via OpenRouter plugins or native Rust code.
- **Anki Export**: Native `.apkg` generation exists in `src-tauri/src/anki.rs`.
- **Firebase**: Sync is handled via `src/context/FirebaseSyncContext.tsx`.
  Ensure rules in `firestore.rules` match any schema changes.
