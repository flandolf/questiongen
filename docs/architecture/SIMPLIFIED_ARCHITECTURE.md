# Simplified Architecture Overview

QuestionGen has been refactored to prioritize simplicity, maintainability, and
scalability by applying the principles of YAGNI (You Ain't Gonna Need It), KISS
(Keep It Simple, Stupid), and SOLID.

## Core Principles Applied

### 1. YAGNI (You Ain't Gonna Need It)

We removed several features that added significant complexity without being core
to the question generation experience:

- **Spaced Repetition**: Removed the complex SM-2 scheduling algorithm and
  review state. Users are encouraged to use the **Anki Export** feature for
  long-term retention, leveraging a specialized tool rather than reimplementing
  one.
- **PDF Export**: Removed local PDF generation logic to reduce frontend
  dependencies and simplify the session lifecycle.

### 2. KISS (Keep It Simple, Stupid)

The data flow and persistence have been drastically simplified:

- **Tauri Store Plugin**: Replaced custom file I/O logic with the official
  `tauri-plugin-store`. This ensures atomic operations and handles
  platform-specific storage (Desktop/Android) automatically.
- **Backend Normalization**: Moved state validation and normalization from
  TypeScript to Rust. By using Serde's `#[serde(default)]`, the backend now
  guarantees a valid state structure, allowing the frontend to remain "dumb" and
  focused only on UI.
- **Lean Components**: `GeneratorView.tsx` was reduced by ~400 lines by moving
  session business logic into the Zustand store.

### 3. SOLID

- **Single Responsibility**: The Rust backend is now the single source of truth
  for "business rules" (state normalization), while the React frontend is
  responsible for presentation and local state orchestration.
- **Modular Slices**: Zustand state is partitioned into focused slices
  (`settings`, `session`, `history`), preventing a "God Object" store.

## Simplified Data Flow

1.  **Frontend Initialization**: On mount, the app calls the
    `load_persisted_state` Tauri command.
2.  **Rust Normalization**: The backend reads the JSON store. Serde
    automatically applies default values and migrates legacy structures.
3.  **State Hydration**: The frontend receives a clean, fully-formed state
    object and populates the Zustand store.
4.  **Action Dispatch**: UI interactions (like marking an answer) dispatch
    actions to the store, which performs the necessary API calls and state
    updates.
5.  **Persistence**: Every state change triggers a debounced save to the Tauri
    Store, ensuring data integrity with minimal performance overhead.

## Scalability

The new architecture is highly scalable:

- **Subjects**: Adding new subjects only requires updating the shared catalog
  JSON.
- **Platforms**: By relying on the Tauri Store and moving I/O to Rust, the app
  is ready for Android deployment with zero changes to the persistence layer.
- **Features**: The modular Zustand slices make it easy to add new session types
  or tools without affecting existing generation logic.
