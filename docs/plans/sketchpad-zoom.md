---
plan name: sketchpad-zoom
plan description: Improve zoom smoothness and add eraser preset sizes
plan status: done
---

## Idea

Update wheel and keyboard zoom to be multiplicative/smooth. Add separate
QUICK_SIZES for the eraser tool to the bottom toolbar so it has appropriately
scaled presets (e.g. 8-64).

## Implementation

- Update onWheel zoom logic to cap deltaY so mouse wheels don't jump massively.
- Update zoomByKeyboardStep to use a multiplicative factor (e.g. 1.25 / 0.8)
  rather than linear addition, so zooming is consistent at all scales.
- Define ERASER_QUICK_SIZES (e.g., [8, 16, 24, 32, 40, 64]) in Sketchpad.tsx.
- Update the mobile size selector in settingsFooter to use ERASER_QUICK_SIZES
  when activeTool is eraser.
- Update the desktop size selector in settingsFooter to use ERASER_QUICK_SIZES
  when activeTool is eraser.

## Required Specs

<!-- SPECS_START -->

- sketchpad-zoom-spec
<!-- SPECS_END -->
