---
plan name: reasoning-tokens
plan description: OpenRouter reasoning tokens support
plan status: done
---

## Idea
Add support for OpenRouter reasoning tokens in the generation pipeline, and add a separate reasoning toggle for marking answers. Currently the app has `modelReasoningEnabled` and `modelReasoningEffort` for generation only. We need to:

1. Update the OpenRouter unified reasoning parameter format in llm.rs to use the new `reasoning` object with `effort`, `max_tokens`, and `exclude` fields per OpenRouter docs
2. Add `markingReasoningEnabled` and `markingReasoningEffort` settings (separate from generation)
3. Pass reasoning params to the marking pipeline in generation.rs
4. Add `reasoning_enabled` and `reasoning_effort` fields to MarkAnswerRequest
5. Update the frontend settings slice, persistence, and ModelsSection UI to include marking reasoning toggle
6. Update the session-slice marking invocations to pass reasoning params

## Implementation
- Update src-tauri/src/llm.rs: Change reasoning parameter construction to use OpenRouter's unified `reasoning` object format (`{"reasoning": {"effort": "..."}}`) instead of legacy format, and add `reasoning_exclude` field to OpenRouterRequestConfig
- Update src-tauri/src/models.rs: Add `reasoning_enabled` and `reasoning_effort` fields to MarkAnswerRequest struct, add `marking_reasoning_enabled` and `marking_reasoning_effort` to PersistedSettings
- Update src-tauri/src/generation.rs: Pass reasoning params to marking_config in perform_marking(), and update mark_answer Tauri command to forward reasoning fields
- Update src/lib/persistence.ts: Add `markingReasoningEnabled` and `markingReasoningEffort` to DEFAULT_SETTINGS and normalizeSettings
- Update src/store/slices/settings-slice.ts: Add markingReasoningEnabled, markingReasoningEffort fields, setters, and defaults
- Update src/views/settings/sections/ModelsSection.tsx: Add marking reasoning toggle and effort selector in the Marking & Grading section, mirroring the generation reasoning UI
- Update src/store/slices/session-slice.ts: Pass markingReasoningEnabled and markingReasoningEffort in both submitWrittenAnswer and batch marking invocations
- Update src/lib/generation-orchestrator.ts: Pass marking reasoning settings to any batch marking calls if applicable
- Run bun run lint && bun run typecheck and cd src-tauri && cargo test to verify

## Required Specs
<!-- SPECS_START -->
<!-- SPECS_END -->