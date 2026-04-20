---
plan name: fullscreen-completion
plan description: Revamp completion screen
plan status: done
---

## Idea

Convert the current card-based CompletionScreen into a fullscreen,
dashboard-style interface with a long scroll layout, keeping the "Academic,
Serious, Precise" tone. The design will focus on a prominent Score & Accuracy
grid at the top, followed by areas to improve, and finally a detailed
question-by-question breakdown natively expanding within the page.

## Implementation

- Remove the outer card wrapper and hero split-column layout in
  CompletionScreen.tsx to utilize the full viewport.
- Redesign the top section to be a dense but clean grid featuring the Score
  Ring, Time, and Analytics metrics.
- Update TopicRow and CriterionChip to fit a fullscreen layout using CSS grid
  for better horizontal space.
- Remove tab-based navigation and inline the detailed QuestionRow list at the
  bottom of the page.
- Relocate the Review Answers and New Session buttons to a sticky action bar for
  easy access while scrolling.
- Refine colors and typography to distinguish performance tiers without looking
  like a gamified or plain spreadsheet UI.

## Required Specs

<!-- SPECS_START -->

- fullscreen-completion
<!-- SPECS_END -->
