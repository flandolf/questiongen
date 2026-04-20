---
plan name: improve-ttft
plan description: Speed up TTFT for mark & gen
plan status: active
---

## Idea

Use streaming for marking responses and partial JSON parsing on the frontend,
plus inject prompt caching for PDF contexts on the backend to drastically
improve TTFT.

## Implementation

- Add `cache_control: { type: \"ephemeral\" }` to the last item in the large
  context arrays (PDF parts or user prompt text) in
  `src-tauri/src/generation.rs` / `src-tauri/src/pdf.rs` to enable prompt
  caching for Anthropic models.
- Update `mark_answer` in `src-tauri/src/generation.rs` to stream the response
  back using `.with_stream(...)` emitting `generation-token` events with a
  unique topic like `marking-{id}`.
- Create a lightweight partial JSON parser utility in the frontend (e.g.
  `src/lib/partial-json.ts`) to incrementally extract fields like
  `feedbackMarkdown`, `workedSolutionMarkdown` from the streamed raw JSON
  string.
- Update `GeneratorView.tsx` (and relevant panels like `WrittenFeedbackPanel`)
  to listen for `marking-{id}` tokens while `isMarking` is true, accumulating
  the stream and rendering the partially parsed feedback in real-time.
- Ensure `batch_mark_answers` allows individual streams to flow to the frontend
  correctly, allowing the UI to show concurrent real-time marking progress for
  all questions simultaneously.

## Required Specs

<!-- SPECS_START -->

- improve-ttft
<!-- SPECS_END -->
