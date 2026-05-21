---
plan name: api-key-saving
plan description: Multi-provider API key management
plan status: done
---

## Idea
Improve API key saving to better support multiple providers. Currently the system has provider-based storage but still maintains a flat apiKey field for backward compatibility. The improvements should:
1. Remove the flat apiKey field dependency and fully commit to per-provider storage
2. Add secure storage option using OS keychain (via tauri-plugin-keychain or similar)
3. Add auto-save behavior so keys are saved immediately when entered (no explicit "Save Key" button needed)
4. Add provider-specific key validation/testing
5. Improve the UI to clearly show which provider's key is active and saved
6. Add key rotation support (ability to have multiple keys per provider and switch between them)

## Implementation
- 1. Add setProviderApiKeyWithTest action to settings slice that validates key via test API call before saving
- 2. Refactor ApiSection.tsx to auto-save keys on input change with debounce, add saved/unsaved visual indicator
- 3. Add provider key status indicators (valid/invalid/untested) with last-tested timestamp to ProviderState
- 4. Remove flat apiKey field from AppState and migrate all references to per-provider pattern
- 5. Integrate tauri-plugin-keychain for encrypted key storage with plaintext fallback for web
- 6. Update persistence layer for secure storage read/write with migration from plaintext
- 7. Update import/export handling and document key stripping behavior in UI
- 8. Add tests for key saving logic and secure storage integration

## Required Specs
<!-- SPECS_START -->
<!-- SPECS_END -->