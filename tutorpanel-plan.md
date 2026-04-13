## Plan: TutorPanel feature suggestions

TL;DR: Propose a small set of high-value features for `TutorPanel.tsx` that integrate with existing stores, sketchpad, settings, and backend streaming. Aim for incremental tasks that are easy to implement and verify.

**Steps**
1. Add quick model & persona presets inside `TutorPanel` (UI): small selector to override settings for the current session. *depends on* reading `PRESET_MODELS` and `useAppSettings()`.
2. Add a "Request diagnostic" button that captures the student's sketch + current conversation and asks the tutor for an error diagnosis (separate API flag). *parallel with* step 1.
3. Replace localStorage indirect sketch retrieval with optional direct Sketchpad DataURL API (Sketchpad exports `getDataUrl(sessionKey)` and dispatches `sketchpad-saved` as now). *blocks* correctness of step 2 for reliability.
4. Add per-session transcript export and "Copy answer" actions (export conversation as Markdown + images encoded as data URLs). *parallel*
5. Add lightweight telemetry calls around `invoke('tutor_chat')` to `logger.ts` and store usage counters in `useTutorStore` (calls, tokens, errors). *parallel*
6. Add a compact UI mode and keyboard shortcut to open the panel focused on input (accessibility + power users). *parallel*

**Relevant files**
- `src/components/tutor/TutorPanel.tsx` — modify to add UI elements and new buttons
- `src/store/tutor.ts` — add counters and export helpers (`exportTranscript(sessionId)`) and metrics persistence
- `src/components/Sketchpad.tsx` — add `getDataUrl(sessionKey)` export and ensure it responds to `tutor-request-sketch-save`
- `src/views/settings/constants.ts` — reuse `PRESET_MODELS`, `PRESET_IMAGE_MODELS`
- `src/lib/logger.ts` — add tutor-related events
- `src-tauri/src/generation.rs` (and `lib.rs`) — optionally support `diagnostic` flag in tutor_chat request (backend change; coordinate with Rust)

**Verification**
1. Unit: Add tests around `useTutorStore` counters and `exportTranscript` (if test harness exists for stores).
2. Manual: Open a question, draw on sketchpad, open TutorPanel, toggle include-sketch, send a "Request diagnostic" and confirm the backend `tutor_chat` request includes images and the `diagnostic` flag.
3. UI: Verify model/persona selector changes the header label and affects the constructed `system` message in outgoing `messages`.
4. Telemetry: Confirm `logger.ts` receives events for `tutor_chat_start`, `tutor_chat_success`, `tutor_chat_error` and that session counters increment.

**Decisions / Assumptions**
- Keep default behaviour unchanged; new controls should be opt-in and non-intrusive.
- Sketchpad direct API is preferred to avoid timing/localStorage races.
- Backend changes (diagnostics flag) require Rust updates; frontend should be guarded to work if backend ignores the flag.

**Further Considerations**
1. Option: Add "explain step N" quick buttons integrated into question UI that pre-fill the tutor prompt. Recommend later.
2. Privacy: ensure image data isn't logged by default in telemetry; only record sizes/tokens, not raw images.

