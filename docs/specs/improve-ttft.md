# Spec: improve-ttft

Scope: feature

# TTFT (Time To First Token) Improvements

## Objective

Drastically improve the perceived and actual Time To First Token for marking and
generation tasks. Marking currently uses a blocking non-streaming request which
feels unresponsive. Generation and marking both send huge PDF contexts (VCAA
reports/exams) which cause large prompt processing latency.

## Requirements

### 1. Marking Streaming (`src-tauri/src/generation.rs`)

- Update `mark_answer` to use `call_openrouter` with
  `.with_stream(self.app.clone(), Some(format!("marking-{}", request.question.id)))`.
- Ensure it does not block the frontend for the entire generation of the
  `MarkAnswerResponse` JSON.
- The `batch_mark_answers` in `src-tauri/src/lib.rs` uses `buffer_unordered(4)`,
  meaning multiple streams will emit simultaneously over Tauri `app.emit`.

### 2. Frontend Partial JSON Parsing

- Create a lightweight streaming parser (e.g. `src/lib/partial-json.ts`) to
  extract string values from the raw incoming JSON stream.
- Specifically extract: `feedbackMarkdown`, `workedSolutionMarkdown`, and
  `comparisonToSolutionMarkdown` as they stream in.
- Update `GeneratorView.tsx`, `WrittenFeedbackPanel.tsx` and the
  `session-slice.ts` store to maintain a `markingStreamTextByQuestionId` state.
- Render the partially parsed markdown in the UI while `isMarking` is active,
  replacing the static loading indicator.

### 3. Context Caching (Anthropic / OpenRouter)

- Inject `cache_control: { type: "ephemeral" }` into the final object of the
  large context (the last PDF part or the last prompt text block) before sending
  to OpenRouter.
- Update `src-tauri/src/generation.rs` and `src-tauri/src/pdf.rs` to append this
  property where appropriate. This single change eliminates the massive
  prompt-processing penalty on subsequent requests with the same reports/exams.

## Constraints

- Do not break the `json_schema` requirements for marking. The backend must
  still wait for the stream to finish and then parse the final JSON into
  `MarkAnswerResponse` before officially completing the marking step.
- Ensure the partial JSON parser safely handles escaped quotes `\"` and newlines
  `\n` without crashing.
