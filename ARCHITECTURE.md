# QuestionGen — Architecture Overview

This document describes the architecture of QuestionGen (local repo:
`questiongen`). It explains the major subsystems, data flows, core logic
components, and where to find relevant code. It is intended for engineers who
want to understand, maintain, or extend the app.

## High-level overview

- Frontend: React + TypeScript single-page app (Vite). UI lives in `src/`.
- App state: local app store and contexts. Key store file: `src/store.ts`.
- Business logic: a set of `lib/` modules that perform generation, persistence,
  scoring, and other domain logic.
- Components: reusable UI components under `src/components/` and view-level
  pages under `src/views/`.
- Native/backend: Tauri-based Rust backend in `src-tauri/` for native
  integrations and local persistence where applicable.
- Data sync: Firestore / Firebase integration and optional local
  persistence/export utilities under `lib/` and `context/`.

## Project layout (important folders)

- `src/` — frontend source code (TypeScript + React):
  - `App.tsx`, `main.tsx` — app entry and root layout.
  - `store.ts` — primary client-side store and shared state interfaces.
  - `AppContext.tsx` — global React contexts for app-level state and providers.
  - `components/` — UI components, grouped by feature (layout, question, ui,
    theme, sketchpad, etc.).
  - `hooks/` — custom React hooks used across the app.
  - `lib/` — core logic modules (see below).
  - `views/` — top-level pages and feature views (GeneratorView, AnalyticsView,
    HistoryView, SavedView, SettingsView, WrongQuestionView).
  - `types/` — shared TypeScript types for API shapes, questions, persistence,
    generator config, telemetry, etc.

- `src-tauri/` — Rust code and Tauri configuration for native features and
  CLI-like tasks:
  - `src/` (Rust): domain-level helpers used by the native side (parsing,
    persistence, models, quality checks, etc.).
  - `tauri.conf.json`, `Cargo.toml`, `build.rs` — Tauri and build config.

- Root-level assets / config:
  - `public/`, `icons/` — static assets
  - `exams/`, `gen/` — generated/exported artifacts and schemas
  - `firebase.json`, `firestore.rules`, `firestore.indexes.json` — Firebase
    configuration

## Core logical subsystems

1. Generator (question creation)
   - Files: `lib/generator-*` (e.g., `generator-batch.ts`,
     `generator-helpers.ts`, `generation-variety.ts`).
   - Purpose: orchestrates generation requests to language models or generation
     engines, batch generation, applying templates, and producing final question
     objects.
   - Responsibilities:
     - Construct prompts and request parameters
     - Manage batching and parallelization (`generator-batch.ts`)
     - Apply deterministic and randomized variation logic
       (`generation-variety.ts`)
     - Post-process and normalize math/content (`math-normalization.ts`)
     - Estimate token cost (`token-estimation.ts`)

2. Question data model and normalization
   - Files: `types/questions.ts`, `lib/math-normalization.ts`,
     `lib/wrong-question.ts`, `lib/question-cache.ts`.
   - Purpose: canonical internal representation of question objects,
     normalization routines for math markup and content, and functionality for
     marking questions wrong / edits.

3. Scoring, quality, and analytics
   - Files: `lib/score-utils.ts`, `lib/generator-helpers.ts`,
     `lib/analysis-chart.tsx` (analytics visualization).
   - Purpose: compute difficulty estimates, quality badges, telemetry events,
     and UI-targeted scoring for questions generated.

4. Persistence and sync
   - Files: `lib/persistence.ts`, `lib/import-export.ts`,
     `context/FirebaseSyncContext.tsx`, `shared/*.json` (catalogs),
     `src-tauri/persistence.rs` equivalents.
   - Purpose: persist generated questions and user state locally and optionally
     sync to Firestore.
   - Key features:
     - Local save/restore and export (JSON/ZIP) via `lib/import-export.ts` and
       `useLocalBackupExport.ts`.
     - Firestore sync using `FirebaseSyncContext` and security rules in
       `firestore.rules`.
     - Handling of oversize documents and sync optimizations (`repo` memory
       files reference historical fixes).

5. UI layer and components
   - Files: `src/components/` and `src/views/`.
   - Responsibilities:
     - Present generation controls, editor and preview, sketchpad tooling,
       analytics dashboards, history, and settings.
     - Components are split by feature (layout/header, question UI,
       markdown/math rendering, sketchpad, theme provider).
     - `MarkdownMath.tsx` handles rendering mixed Markdown + math;
       `Sketchpad.tsx` + `sketchpad-renderer.ts` handle sketch capture and
       rendering.

6. Sketchpad and drawing pipeline
   - Files: `src/components/Sketchpad.tsx`, `lib/sketchpad-renderer.ts`,
     `src/components/sketchpadUtils.ts`.
   - Purpose: capture freehand input, raster/vector export, and integrate
     sketches into questions or answers. Includes performance optimizations and
     persistence hooks.

7. Spaced repetition and study flows
   - Files: `lib/spaced-repetition.ts`, `types/spaced-repetition.ts`.
   - Purpose: schedule question reviews, maintain review histories, and update
     strengths/intervals based on user results.

8. Randomization and selection utilities
   - Files: `lib/randomization.ts`, `lib/batch-distribution.ts`.
   - Purpose: deterministic/random selection of items for batches, creations,
     and assessments.

9. Telemetry and analytics
   - Files: `lib/analytics-chart.tsx`, `lib/app-utils.ts`, `types/telemetry.ts`.
   - Purpose: emit events for user interactions, generator runs, and record
     aggregated metrics used by `AnalyticsView`.

10. Native integration and CLI features (Tauri)
    - Files: `src-tauri/src/*.rs`.
    - Purpose: platform features such as file-system access, local native
      persistence, special parsing or heavy compute done in Rust for
      performance.
    - Notable modules: `parsing.rs`, `persistence.rs`, `quality.rs`,
      `openrouter.rs` (model/adapter helpers).

## Data flow (typical generation flow)

1. User opens `GeneratorView` and configures a generation job (prompt, variety,
   batch size).
2. UI composes a request and calls generator API in `lib/generator-batch.ts` via
   a high-level `generate()` helper.
3. Generator helpers build prompts and apply variety transforms
   (`generation-variety.ts`) and call the model adapter.
4. The model adapter returns raw results which are post-processed
   (`math-normalization.ts`, `generator-helpers.ts`).
5. Results are stored in local store (`src/store.ts`) and optionally persisted
   via `lib/persistence.ts` and synced to Firestore via `FirebaseSyncContext`.
6. Analytics events about the run are emitted to telemetry systems and
   visualized in `AnalyticsView`.

## State management

- `src/store.ts` acts as the central store for app-level state (questions,
  active session, preferences). The store exposes typed actions used across
  views and components.
- React contexts (e.g., `AppContext.tsx`, `FirebaseSyncContext.tsx`) provide
  scoped services (auth, sync, settings).
- Hooks under `src/hooks/` encapsulate common behavior and side-effects (timer,
  local backup, model stats).

## Key cross-cutting concerns

- Input normalization: math and text sanitization to make model output stable.
- Determinism vs randomness: variety modules can apply randomness but some paths
  are deterministic for reproducible results.
- Performance: heavy operations (sketch rendering, parsing) may be delegated to
  Rust in `src-tauri/`.
- Offline robustness: local export/import and local store to avoid data loss
  when offline.
- Security and sync: Firestore rules (root-level configs) enforce permitted
  operations; large payloads are chunked or avoided.

## Tests and quality

- Unit tests (if present) typically target `lib/` modules and core logic
  functions.
- For UI, component-level tests should render views and assert outputs;
  snapshotting can be used for complex renderers like `MarkdownMath`.

## Where to make changes

- Add new generation features: extend `lib/generator-*`, add types in
  `types/generator.ts`, and wire a control in `GeneratorView`.
- Add new persistence targets: update `lib/persistence.ts` and
  `context/FirebaseSyncContext.tsx`.
- Add new native features: update `src-tauri/src/*.rs` and `tauri.conf.json`.

## Notes and known places to inspect

- `lib/token-estimation.ts` — useful when adding new model providers to estimate
  cost.
- `lib/math-normalization.ts` — central for any math/LaTeX changes.
- `src/components/Sketchpad.tsx` and `lib/sketchpad-renderer.ts` — for
  visual/sketch changes.
- `store.ts` and `AppContext.tsx` — if you need to change app-wide state or
  providers.

## JSON Schemas (model response formats)

The Rust backend exposes named JSON schema response formats used when calling
LLMs. These are defined in `src-tauri/src/lib.rs` and wrapped by helper builders
in `src-tauri/src/openrouter.rs`.

- **written_questions**: expected response for written (long-form) questions.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["questions"],
  "properties": {
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "topic", "subtopic", "promptMarkdown", "maxMarks"],
        "properties": {
          "id": { "type": "string" },
          "topic": { "type": "string" },
          "subtopic": { "type": ["string", "null"] },
          "promptMarkdown": { "type": "string" },
          "maxMarks": { "type": "integer", "minimum": 1, "maximum": 30 }
        }
      }
    }
  }
}
```

- **mc_questions**: expected response for multiple-choice questions.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["questions"],
  "properties": {
    "questions": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "id",
          "topic",
          "subtopic",
          "promptMarkdown",
          "options",
          "correctAnswer",
          "explanationMarkdown"
        ],
        "properties": {
          "id": { "type": "string" },
          "topic": { "type": "string" },
          "subtopic": { "type": ["string", "null"] },
          "promptMarkdown": { "type": "string" },
          "options": {
            "type": "array",
            "minItems": 4,
            "maxItems": 4,
            "items": {
              "type": "object",
              "additionalProperties": false,
              "required": ["label", "text"],
              "properties": {
                "label": { "type": "string" },
                "text": { "type": "string" }
              }
            }
          },
          "correctAnswer": { "type": "string", "enum": ["A", "B", "C", "D"] },
          "explanationMarkdown": { "type": "string" }
        }
      }
    }
  }
}
```

- **mark_answer**: expected response from the marking/assessment endpoint.

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": [
    "verdict",
    "achievedMarks",
    "maxMarks",
    "vcaaMarkingScheme",
    "comparisonToSolutionMarkdown",
    "feedbackMarkdown",
    "workedSolutionMarkdown",
    "exemplarResponseMarkdown",
    "mcOptionExplanations",
    "promptTokens",
    "completionTokens",
    "totalTokens"
  ],
  "properties": {
    "verdict": { "type": "string" },
    "achievedMarks": { "type": "integer", "minimum": 0 },
    "maxMarks": { "type": "integer", "minimum": 1 },
    "vcaaMarkingScheme": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["criterion", "achievedMarks", "maxMarks", "rationale"],
        "properties": {
          "criterion": { "type": "string" },
          "achievedMarks": { "type": "integer", "minimum": 0 },
          "maxMarks": { "type": "integer", "minimum": 0 },
          "rationale": { "type": "string" }
        }
      }
    },
    "comparisonToSolutionMarkdown": { "type": "string" },
    "feedbackMarkdown": { "type": "string" },
    "workedSolutionMarkdown": { "type": "string" },
    "exemplarResponseMarkdown": { "type": "string" },
    "mcOptionExplanations": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["option", "isCorrect", "explanation"],
        "properties": {
          "option": { "type": "string" },
          "isCorrect": { "type": "boolean" },
          "explanation": { "type": "string" }
        }
      }
    },
    "promptTokens": { "type": "integer", "minimum": 0 },
    "completionTokens": { "type": "integer", "minimum": 0 },
    "totalTokens": { "type": "integer", "minimum": 0 }
  }
}
```

Notes:

- The Rust code wraps these schemas with `json_schema_format` or
  `json_schema_format_anthropic` (see
  [src-tauri/src/openrouter.rs](src-tauri/src/openrouter.rs#L522)), which
  adjusts constraints for Anthropic model compatibility.
