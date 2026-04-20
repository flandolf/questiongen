---
plan name: fix-sketchpad
plan description: Fix Sketchpad load/save
plan status: done
---

## Idea

Fix sketchpad loading and saving issues by managing the autosave timeout
correctly and removing the canvasRef dependency from the initial load effect.

## Implementation

- In src/components/Sketchpad.tsx, locate the useEffect that restores the canvas
  from storage on mount.
- Remove `&& canvasRef.current` from the condition so it loads strokes into
  state even if the canvas is not yet mounted (e.g., when the sketchpad is a
  closed modal).
- Locate the useEffect that schedules auto-save after drawing completes.
- Add logic to clear `autoSaveTimeoutRef.current` when `isDrawing` is true. This
  prevents a previous stroke's timeout from firing mid-stroke, which would
  incorrectly clear the dirty flag and cause subsequent strokes to be skipped.
- Run the project lint and typecheck commands to ensure no regressions were
  introduced.

## Required Specs

<!-- SPECS_START -->
<!-- SPECS_END -->
