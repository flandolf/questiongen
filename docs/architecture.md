**Architecture Overview**

This document summarizes the system architecture for QuestionGen.

- Frontend: React + Vite + TypeScript. Core UI in `src/` with components in `src/components/` and views in `src/views/`.

Quick links:
- Entry: [src/main.tsx](src/main.tsx#L1)
- App: [src/App.tsx](src/App.tsx#L1)
- Store: [src/store.ts](src/store.ts#L1)
- Native Backend: Tauri (Rust) in `src-tauri/` providing prompt handling, parsing, PDF/Anki exports, and OpenRouter integration.

Quick links:
- Tauri entry: [src-tauri/src/main.rs](src-tauri/src/main.rs#L1)
- Generation: [src-tauri/src/generation.rs](src-tauri/src/generation.rs#L1)
- Schemas: [src-tauri/src/schemas.rs](src-tauri/src/schemas.rs#L1)
- State: Zustand stores located in `src/store.ts` and `src/store/*` slices; persistence to local storage and optional Firestore sync via `src/context/FirebaseSyncContext.tsx`.
- Generation flow: Frontend orchestration in `src/lib/generator-batch.ts` -> `src-tauri/src/generation.rs` (native execution) with JSON schema validation in `src-tauri/src/schemas.rs`.

See `docs/architecture/SIMPLIFIED_ARCHITECTURE.md` for a simplified diagram and flow.
