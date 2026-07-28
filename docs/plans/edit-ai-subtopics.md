---
plan name: edit-ai-subtopics
plan description: Edit & Generate Subtopics
plan status: active
---

## Idea

Allow users to edit existing subtopics and AI-generate new custom subtopics,
synced via Supabase

## Implementation

- 1. Sync: Add Supabase `cloud_records` rows for the `customSubtopics`
     collection, keyed by topic
- 2. Sync: Add frontend mutations to save/load custom subtopics from Supabase
- 3. Backend: Add Tauri command for AI subtopic generation (prompt with topic
     context, output JSON array of subtopic objects)
- 4. Frontend: Add customSubtopics to store (state, persistence, Supabase sync)
- 5. Frontend: Create SubtopicEditorModal component (edit name, technique_notes,
     group)
- 6. Frontend: Add '+' button in AdvancedOptions section of SetupPanel
- 7. Frontend: Create Settings > Subtopics page (list all topics, expand to
     see/edit subtopics, add AI generate flow)
- 8. Frontend: Create AiGenerateSubtopicsModal (select model, enter count, show
     generated preview, approve/reject)
- 9. Frontend: Integrate custom subtopics into subtopic selection UI (combine
     catalog + custom)
- 10. Testing: Verify Supabase sync works, AI generates valid subtopic objects,
      UI works correctly

## Required Specs

<!-- SPECS_START -->

- edit-ai-subtopics
<!-- SPECS_END -->
