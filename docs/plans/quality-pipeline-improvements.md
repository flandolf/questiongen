---
plan name: quality-pipeline-improvements
plan description: Four quality/speed/reliability improvements
plan status: active
---

## Idea
Implement four improvements to the question generation pipeline: (1) Add 2-3 hardcoded VCAA-style few-shot exemplar questions per subject to the generation prompts, (2) Add quality-driven regeneration that regenerates only low-scoring questions while excluding 1-mark written questions from all quality checks, (3) Parallelize subtopic calls within a topic to improve generation speed, (4) Expand the LaTeX command protection heuristic from hardcoded command lists to prefix-matching for broader coverage.

## Implementation
- Add few-shot exemplar constants to prompts.rs: Create WRITTEN_EXEMPLARS and MC_EXEMPLARS constants with 2-3 VCAA-style questions per subject (Mathematical Methods, Specialist Mathematics, General Mathematics, Chemistry, Biology, Physical Education). Each exemplar includes promptMarkdown, maxMarks (written) or options+correctAnswer (MC), and demonstrates correct scaffold structure, command verb usage, and MC distractor style. Inject into UserPromptBuilder via a new exemplars_note() function that appends relevant examples after CONSTRAINTS and before GOAL in build_written() and build_mc().
- Add quality-driven regeneration logic to generation.rs: After quality::score_batch() returns metrics, identify questions with distinctness < 0.3 that have maxMarks > 1 (1-mark written questions excluded from ALL quality checks). If any questions fail, make one more ChatGPT completion with the failing question stems added to prior_question_prompts as anti-examples. For MC questions, apply the same distinctness threshold. Store regeneration telemetry (original score, regenerated score, retry count).
- Parallelize subtopic calls in generation-orchestrator.ts: In the subtopic-focused mode loop (lines 187-243), replace the sequential for/await with Promise.all() over subCalls. Maintain per-subtopic streaming text by using topic+subtopic as the stream key. Ensure error handling catches partial failures (some subtopics succeed, others fail) and still returns partial results.
- Expand LaTeX protection in parsing.rs: Replace the hardcoded LaTeX command lists (lines 116-174) with a prefix-matching approach: treat any backslash followed by 3+ alphabetic characters inside a JSON string as a potential LaTeX command and escape it. Keep the existing JSON escape validation (don't escape genuine \n, \t, \r, \f, \b, \u followed by non-alpha). Add unit tests for new edge cases like \frel, \tpartial, \nabla variants.
- Add missing TS type fields: Add verbDiversityCount and scaffoldPattern to GeneratedQuestion and McQuestion types in src/types/questions.ts. Add commandVerbDiversity and markAllocationVariance to GenerationTelemetry type.
- Write tests: Add Rust unit tests in quality.rs for the new regeneration threshold logic (1-mark exclusion, distinctness threshold). Add tests in parsing.rs for the new prefix-matching protection. Verify parallelization doesn't break streaming UI updates.

## Required Specs
<!-- SPECS_START -->
<!-- SPECS_END -->
