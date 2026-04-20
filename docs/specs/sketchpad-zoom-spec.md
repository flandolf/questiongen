# Spec: sketchpad-zoom-spec

Scope: feature

## Sketchpad Zoom & Eraser UI Refinements

### Zoom Improvements

- Current zoom uses linear addition (`+ 0.25`) which scales poorly. Change
  `zoomByKeyboardStep` to multiply by `1.25` or `0.8` respectively.
- Typical mouse wheels jump too fast with `Math.exp(-deltaY * 0.01)`. Apply
  clamping (`Math.max(-50, Math.min(50, e.deltaY))`) to `deltaY` to normalize
  huge jumps while keeping trackpads smooth.

### Eraser Quick Sizes

- The default `QUICK_SIZES` (`[2, 4, 8, 12, 16, 24]`) are too small for typical
  eraser use (default is `40`).
- Define `ERASER_QUICK_SIZES = [8, 16, 24, 32, 40, 64]`.
- Update the `settingsFooter` toolbar logic for both mobile and desktop: use
  `ERASER_QUICK_SIZES` instead of `QUICK_SIZES` when `activeTool === 'eraser'`.
