# Spec: edit-ai-subtopics

Scope: feature

# FEATURE SPEC: Edit & AI Generate Subtopics

## Overview

Allow users to edit existing subtopics and AI-generate new custom subtopics.
Custom subtopics sync via Firebase and are available alongside catalog subtopics
during question generation.

---

## 1. Data Model

### Custom Subtopic Structure

```typescript
interface CustomSubtopic {
  id: string; // UUID
  topic: Topic; // Parent topic (e.g., "Biology")
  name: string; // Subtopic name
  technique_notes?: {
    core_concepts?: string;
    exam_style_guidelines?: string;
    anti_prompts?: string[];
    tech_free_rules?: string;
    tech_active_rules?: string;
  };
  group?: string; // Unit/AOS group (e.g., "unit1-How-do-organisms-regulate-their-functions?")
  createdAt: Date;
  updatedAt: Date;
}
```

### Firestore Collection

- Path: `users/{uid}/customSubtopics/{topicName}`
- Document structure: `{ subtopics: CustomSubtopic[] }`
- Merge on sync (existing entries preserved, new ones added)

---

## 2. Backend (Tauri/Rust)

### 2.1 New Commands

**`get_custom_subtopics(topic: String)`**

- Input: topic name
- Output: `Vec<CustomSubtopic>` loaded from Firebase

**`save_custom_subtopics(topic: String, subtopics: Vec<CustomSubtopic>)`**

- Input: topic name, array of custom subtopics
- Action: Saves to Firebase (merges with existing)

**`delete_custom_subtopic(topic: String, subtopic_id: String)`**

- Input: topic name, subtopic ID
- Action: Removes from Firebase

**`generate_subtopics(topic: String, count: u8, model: String) -> Vec<GeneratedSubtopic>`**

- Input: topic name, number to generate, model ID (from PRESET_MODELS)
- Output: Array of generated subtopic objects (name, technique_notes, group)
- Prompt: Include topic's examGuidance + existing subtopic names as context

### 2.2 Prompt Design

```
Generate {count} VCE {topic} subtopics based on the study design.

Context:
- Exam guidance: {topic.examGuidance}
- Existing subtopics: {existing_subtopic_names}

For each subtopic, provide:
- name: Clear, specific subtopic name (2-6 words)
- group: Which unit/AOS it belongs to (format: unit#-AOS-slug)
- technique_notes:
  - core_concepts: 1-2 sentence description
  - exam_style_guidelines: 1-2 sentence guidance for exam questions
  - anti_prompts: Array of 2-3 things to avoid

Output as JSON array.
```

---

## 3. Frontend State (Zustand)

### 3.1 New Store Slice

```typescript
interface CustomSubtopicsSlice {
  customSubtopics: Record<Topic, CustomSubtopic[]>;
  loadCustomSubtopics: (topic: Topic) => Promise<void>;
  addCustomSubtopic: (topic: Topic, subtopic: CustomSubtopic) => Promise<void>;
  updateCustomSubtopic: (
    topic: Topic,
    subtopic: CustomSubtopic,
  ) => Promise<void>;
  deleteCustomSubtopic: (topic: Topic, subtopicId: string) => Promise<void>;
}
```

### 3.2 Persistence

- Save to localStorage on change
- Load on app init
- Firebase sync via mutations (similar to savedSets)

---

## 4. UI Components

### 4.1 SubtopicEditorModal

- Trigger: Click on any subtopic (or "+" to add new)
- Fields:
  - Name (text input, required)
  - Group (dropdown: existing groups for topic, or "Create new")
  - Core Concepts (textarea)
  - Exam Style Guidelines (textarea)
  - Anti-prompts (textarea, comma-separated or array)
- Actions: Save, Cancel, Delete (if editing existing custom)

### 4.2 AdvancedOptions "+" Button

- Location: SetupPanel.tsx, in/near the subtopic selector section
- Behavior: Opens SubtopicEditorModal with empty form
- Icon: Plus icon with tooltip "Add custom subtopic"

### 4.3 Settings > Subtopics Page

- Route: `/settings/subtopics`
- Layout:
  - List of all 6 topics as expandable accordions
  - Each topic shows two sections: "Catalog Subtopics" (read-only) and "Custom
    Subtopics" (editable)
  - Custom subtopics: Edit/Delete buttons per item
  - "AI Generate Subtopics" button per topic

### 4.4 AiGenerateSubtopicsModal

- Fields:
  - Model selector (dropdown, uses PRESET_MODELS)
  - Number to generate (number input, 1-20, default 5)
  - Optional: Description/focus area (textarea)
- Preview: Shows generated subtopics in cards (name, group, technique_notes
  preview)
- Actions:
  - "Regenerate" button to retry with same params
  - "Add Selected" - checkboxes to select which to add
  - "Add All" - adds all generated
  - "Cancel"

---

## 5. Integration Points

### 5.1 Subtopic Selection UI (SetupPanel)

- Combine: Catalog subtopics + custom subtopics
- Custom subtopics marked with indicator (e.g., "Custom" badge or different
  color)
- Edit icon on hover for custom subtopics

### 5.2 Question Generation

- Pass custom subtopics to generation service (they work like catalog subtopics)
- Custom subtopics include their technique_notes in prompt context

---

## 6. Error Handling

- Firebase auth required: Show "Sign in to sync custom subtopics" if not
  authenticated
- API errors: Show toast with error message, allow retry
- Invalid generated subtopics: Validate structure before showing preview, skip
  invalid

---

## 7. Edge Cases

- Same name as catalog subtopic: Allow but show warning
- Deleting a custom subtopic that's used in saved sets: Allow, questions retain
  the name
- Network offline: Cache changes, sync when online (Firestore handles this)
- Model not available: Fallback to default model or show error
