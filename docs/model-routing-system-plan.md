# Model Routing System Rebuild

## Summary

Replace the current patched-on provider logic with one canonical routing model: every AI task stores an explicit `{ providerId, modelId }` route, and backend calls receive a resolved route instead of guessing from global model strings. Build the core around OpenAI-compatible chat completions, with provider-specific capability, pricing, and request-parameter metadata layered on top.

Primary providers for v1: OpenRouter, DeepSeek, NVIDIA NIM, and custom OpenAI-compatible endpoints.

Sources checked:

- [OpenRouter usage](https://openrouter.ai/docs/cookbook/administration/usage-accounting)
- [OpenRouter streaming](https://openrouter.ai/docs/api-reference/streaming)
- [DeepSeek chat completions](https://api-docs.deepseek.com/api/create-chat-completion)
- [NVIDIA NIM API](https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html)

## Key Changes

- Add a canonical frontend route shape: `ModelRoute = { providerId, modelId, pricingOverride?, enabledCapabilities? }`.
- Replace old global `apiKey`, `model`, `markingModel`, `imageMarkingModel`, and `tutorModel` as active runtime inputs with per-task routes: `generation`, `marking`, `imageMarking`, `tutor`, `utility`.
- Hard-reset runtime logic to use the new route fields only; keep a one-time migration from old persisted settings so existing users land on equivalent routes.
- Keep optional API key sync, default it off, and preserve export/import scrubbing unless the sync path explicitly opts in.
- Replace provider guessing helpers with direct lookup: route -> provider config -> credentials -> backend request.

## Backend Router

- Rename/reshape the current `engine/provider.rs` into the single LLM transport layer instead of adding a second abstraction.
- Replace `OpenRouter*` transport names with provider-neutral names such as `ChatRequest`, `ChatResponse`, `ProviderCapabilities`, and `Usage`.
- Keep one OpenAI-compatible chat-completions adapter for OpenRouter, DeepSeek, NVIDIA NIM, and custom endpoints.
- Add small provider metadata: supported params, structured output mode, streaming usage behavior, reasoning params, model listing endpoint, pricing source.
- Remove base-URL heuristics from generation/marking code; the router owns provider-specific request shaping.

## Streaming And Usage

- Use one streaming event contract for all text calls: `llm-stream-start`, `llm-stream-token`, `llm-stream-usage`, `llm-stream-end`, `llm-stream-error`.
- Include `requestId`, `task`, `route`, and optional `topic/questionId` in every event so frontend buffers do not depend on provider-specific event names.
- Stream generation, marking, tutor, subtopics, cleanup, and other text calls when supported; fall back to non-streaming per provider capability.
- Parse final usage from provider responses: OpenRouter usage/cost when present, DeepSeek usage via `stream_options.include_usage`, NVIDIA/custom usage when returned.

## Cost Policy

- Cost display priority: official provider cost or pricing first, user manual pricing overrides second, rough heuristic last.
- Label estimate quality explicitly: `actual`, `priced`, `manual`, `estimated`, or `unknown`.
- Do not fabricate precision for NVIDIA/custom models without pricing. Show unknown unless the user adds pricing or enables rough estimates.
- Store pricing overrides per `{ providerId, modelId }`, not globally by model name.

## Test Plan

- Unit test route migration from old settings into per-task routes.
- Unit test provider request shaping for OpenRouter, DeepSeek, NVIDIA, and custom endpoints.
- Unit test SSE parsing with token chunks, final usage chunks, `[DONE]`, partial lines, and abort.
- Unit test cost quality labels for actual, priced, manual, estimated, and unknown.
- Run `bun run lint && bun run typecheck`.
- Run `cd src-tauri && cargo test`.
- No visual verification.

## Assumptions

- v1 supports OpenAI-compatible providers only; non-compatible APIs wait until a real need appears.
- No automatic fallback chains in v1.
- API key sync remains optional, off by default.
- Existing users get a migration, but new runtime code does not preserve old flat model/provider behavior.
