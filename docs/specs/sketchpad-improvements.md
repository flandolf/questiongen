# Spec: sketchpad-improvements

Scope: feature

# FEATURE SPEC: Sketchpad Improvements

## Overview

Upgrade the sketchpad from a basic drawing utility into a polished, first-class
answer input for VCE math and science working. Improvements span new tools
(selection/transform), seamless integration with text/image upload, better
performance, and a smoother UX that lets sketches stand alone as primary
answers.

---

## 1. Current State

The sketchpad already supports:

- **Tools**: pen, eraser, line, rect, ellipse, text, graph axes
- **Backgrounds**: lined, white-grid, black-grid, dot-grid
- **Pressure sensitivity** with configurable curves
- **Undo/redo** (40 snapshots)
- **Zoom/pan** (0.1x–10x) with touch gestures and mouse wheel
- **SVG persistence** via Tauri store, auto-save, cleanup (max 15 sketches)
- **Export** to PNG data URL (with light-theme forcing for tutor/mark)
- **Dark/light theme** support
- **Palm rejection** and pen-only mode
- **Keyboard shortcuts** (tool switching, undo/redo, zoom)
- **Embedded and modal** modes

**Integration points:**
- `WrittenAnswerCard`: sketchpad is a third tab alongside "Response" and "Upload
  image"
- `McAnswerCard`: inline sketchpad toggle
- `TutorPanel`: "Attach Sketchpad Content" button exports sketch to tutor chat
- `WrongQuestionView`: same tab structure as generator

**Pain points identified:**
- Switching between sketchpad and text/image tabs feels clunky
- No way to select, move, or edit strokes after drawing
- Sketchpad is treated as secondary; students want it to be a primary answer
  format
- Export always happens manually; no seamless hand-off between tabs

---

## 2. Goals & Principles

1. **Sketch as primary answer**: A drawing should be submittable on its own,
   without requiring a text response.
2. **Seamless tab switching**: Moving between text, sketch, and upload should
   feel like one continuous workspace, not three disconnected panels.
3. **Editable strokes**: Users must be able to select, move, and transform
   existing content — not just draw over it.
4. **Performance at scale**: Large sketches with many strokes must remain
   responsive.
5. **Zero friction for common actions**: Export, save, and submit should happen
   automatically where possible.

---

## 3. Feature Specifications

### 3.1 Selection Tool (Lasso + Rectangle)

**New tool**: `select` — adds a selection mode alongside existing tools.

#### Selection modes

- **Rectangle select**: drag a box to select all strokes whose bounding boxes
  intersect the rect.
- **Lasso select**: freehand closed path; select strokes whose points fall
  inside the lasso polygon.

#### Selection state

```typescript
type SelectionState = {
  selectedStrokeIds: Set<string>;
  selectionBounds: { x: number; y: number; width: number; height: number } | null;
  transform: {
    translate: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number; // degrees
  };
};
```

#### Operations on selected strokes

| Operation | Trigger | Behavior |
|-----------|---------|----------|
| Move | Drag inside selection bounds | Translate all selected strokes |
| Delete | `Delete` / `Backspace` key or trash icon | Remove selected strokes, push undo |
| Duplicate | `Ctrl+D` / `Cmd+D` or duplicate icon | Clone strokes with new IDs, offset by (20, 20) |
| Resize | Drag corner/edge handles | Scale selection from opposite handle anchor |
| Rotate | Drag rotation handle (above top-center) | Rotate selection around its center |
| Change color | Color picker in selection toolbar | Batch-update stroke color |
| Change size | Size slider in selection toolbar | Batch-update stroke size |

#### Visual feedback

- Selected strokes get a subtle glow/outline (2px primary-colored border)
- Selection bounds shown as a dashed rectangle with 8 resize handles + 1 rotate
  handle
- Handle size scales with zoom so they remain usable at all zoom levels
- During transform, a ghost preview renders on the overlay canvas; committed on
  pointer up

#### Implementation notes

- Add `selected: boolean` transient flag to stroke rendering (not persisted)
- Transform is applied by modifying `stroke.points` on commit (not a matrix
  transform) so SVG export remains correct
- For rotation: rotate each point around selection center
- For scale: multiply point offsets from center by scale factor
- Maintain aspect ratio when `Shift` is held during resize
- Snap to 15° increments when `Shift` is held during rotation

---

### 3.2 Sketch-as-Primary-Answer Workflow

#### Current behavior

The `WrittenAnswerCard` has three tabs: Response, Upload image, Sketchpad. Only
one is active at a time. Submitting from the sketchpad tab exports the sketch
and sends it as an image attachment.

#### New behavior

1. **Sketchpad tab becomes a first-class answer input**:
   - When the sketchpad tab is active, the "Submit for Marking" button is
     enabled even if the text area is empty.
   - The sketchpad's content is treated as the student's answer (exported as an
     image and sent to the marking backend).

2. **Auto-export on tab switch**:
   - When switching **from** sketchpad **to** text or upload, the sketch is
     automatically exported to a PNG data URL and displayed as an image
     attachment in the answer card (same treatment as an uploaded image).
   - The sketch remains editable; switching back to the sketchpad tab restores
     the live canvas.
   - This gives students a preview of what was captured and lets them verify
     before final submission.

3. **Auto-save on submit**:
   - When submitting from the sketchpad tab, the export happens automatically
     (no confirmation step beyond the existing double-tap confirm).
   - The exported image is attached to the submission payload exactly like an
     uploaded image.

4. **Sketch thumbnail on text tab**:
   - When a sketch exists for the current question, show a small thumbnail
     preview below the text area on the Response tab.
   - Clicking the thumbnail jumps to the sketchpad tab.
   - This provides awareness without clutter.

#### Data flow

```
User draws in sketchpad
  ↓
Switch to "Response" tab
  ↓
Auto-export → PNG data URL
  ↓
Display as image attachment (StudentAnswerImage)
  ↓
User can delete attachment, edit text, or switch back to sketchpad
  ↓
On submit: include image.dataUrl in marking payload (same as upload)
```

#### Integration with `WrittenAnswerCard`

- Add `sketchImage?: StudentAnswerImage` to local state (separate from
  `image`)
- On tab switch from sketchpad → response: call
  `sketchpadRef.current.exportDataUrl()` and create a `StudentAnswerImage`
- On tab switch from response → sketchpad: no action (canvas is live)
- On submit from sketchpad tab: auto-export and attach
- The existing `image` upload and `sketchImage` can coexist — both are sent to
  marking

---

### 3.3 Improved Tab UX (Recommended: Inline Expandable Sketchpad)

The user indicated "whatever is best" for tab UX. The recommendation is an
**inline expandable sketchpad** that reduces the jarring tab-switch feeling:

#### Design

- **Default state**: The answer card shows the text area. Below it, a compact
  toolbar row: "🖊 Sketchpad" button, "📎 Upload image" button.
- **Sketchpad expanded**: Clicking "🖊 Sketchpad" expands the sketchpad inline
  below the text area (or replaces the text area, toggleable). The sketchpad
  takes up ~40–60vh.
- **Text remains visible**: In expanded mode, the text area collapses to a
  single-line summary (e.g., "120 words written — click to expand") so the
  student never loses context of what they've written.
- **Image upload**: Same inline expansion behavior.

#### Why this over alternatives

- **Side-by-side always**: Too cramped on laptops; generator already has a
  side-by-side layout for question + answer.
- **Floating window**: Would overlap the question text; bad for reading the
  question while sketching.
- **Keep tabs + animations**: Doesn't solve the fundamental problem (mutual
  exclusivity).
- **Replace with preview**: Loses the ability to see both at once.

#### Implementation

- Refactor `WrittenAnswerCard` to use a single card with expandable sections
  instead of three mutually exclusive tabs.
- Use Framer Motion `AnimatePresence` + `motion.div` for smooth expand/collapse
  transitions.
- The sketchpad `embedded` prop already supports inline rendering; we just need
  to change the surrounding chrome.

---

### 3.4 Performance Improvements

#### Quadtree spatial index for hit testing

- Current hit testing for eraser and (new) selection scans all strokes.
- Implement a simple quadtree in `sketchpadUtils.ts` for `O(log n)` hit tests.
- Rebuild the quadtree after each stroke commit or bulk operation.

#### Stroke culling during render

- Only render strokes whose bounding boxes intersect the viewport.
- Compute viewport bounds in world coordinates and filter `strokesRef.current`
  before calling `renderStrokesToCanvas`.

#### Simplified rendering for zoomed-out views

- When zoom < 0.5, skip Catmull-Rom smoothing and render raw points.
- When zoom < 0.2, merge adjacent short segments into single lines.

#### Layered canvas architecture

- Separate the main canvas into two layers:
  1. **Static layer**: committed strokes (rarely changes)
  2. **Active layer**: current stroke, selection preview, overlay shapes
- The static layer only redraws on undo/redo/clear/transform commit; the active
  layer redraws at 60fps during interaction.

---

### 3.5 Additional Tool Improvements

#### Highlighter / marker

- New tool `highlighter`
- Semi-transparent yellow (#fef08a at 40% opacity) by default
- Flat line cap (not round) for marker-like appearance
- Variable width, no pressure sensitivity
- Renders with `globalCompositeOperation = 'multiply'` or `source-over` with
  low alpha

#### Ruler / angle snap enhancement

- Extend existing line tool: when `Shift` is held, show a temporary ruler line
  extending across the canvas at the snapped angle.
- Show the angle in degrees near the cursor.

#### Equation tool (future / optional)

- New tool `equation`
- User types LaTeX (e.g., `\int_0^\pi \sin(x) dx`)
- Render via MathJax to an offscreen canvas, then draw the rendered math as an
  image onto the sketchpad
- Store as a `text` stroke with a `renderAsLatex: true` flag

---

### 3.6 Persistence & Export Improvements

#### Export formats

- Add "Export as SVG" option (we already serialize to SVG; just need UI)
- Add "Export as PDF" option (single-page PDF containing the sketch)
- Export should include the background paper style

#### Sketch history / versioning

- Keep a local history of exports per session (last 5 versions)
- Allow "revert to previous version" from a dropdown in the toolbar
- Store as `sketchpad-canvas-history-${sessionKey}` in Tauri store

#### Auto-cleanup improvements

- Current cleanup keeps 15 most-recent sketches.
- Also keep sketches that are associated with history entries (submitted
  answers) — never delete those.
- Add a "Manage Sketches" UI in Settings showing per-question sketch storage
  usage with delete buttons.

---

## 4. UI/UX Details

### 4.1 Selection Toolbar

When strokes are selected, a floating contextual toolbar appears near the
selection (or fixed at the top if selection is near the top edge):

```
[🗑 Delete] [📋 Duplicate] [⬛ Color] [Size: ────] [↺ Rotate 90°]
```

- Toolbar dismisses on Escape click or clicking outside the selection.
- Color picker uses the existing `ColorPicker` component.

### 4.2 Sketchpad Toolbar Updates

- Add `select` tool icon (dashed square) to the top tool bar.
- Reorder tools logically: select, pen, highlighter, eraser, line, rect,
  ellipse, text, graph.
- When select is active, hide size/smoothing sliders (or repurpose them for
  selection properties).

### 4.3 Inline Expandable Section (WrittenAnswerCard)

```
┌─────────────────────────────────────┐
│  Response  |  Sketchpad  |  Upload  │  ← compact segment control
├─────────────────────────────────────┤
│                                     │
│  [Text area or sketchpad content]   │
│                                     │
├─────────────────────────────────────┤
│  🖊 Expand Sketchpad  📎 Upload      │  ← action bar (shown when collapsed)
└─────────────────────────────────────┘
```

- Segment control replaces the current three equal buttons.
- Only one section is "expanded" at a time; others show a summary.
- Smooth `height` animation via Framer Motion.

### 4.4 Sketch Thumbnail on Text Tab

- When a sketch image exists, show a 80px tall rounded thumbnail below the text
  area.
- Hover: "Click to edit in sketchpad" tooltip.
- Delete button (×) on hover to clear the sketch attachment.

---

## 5. Technical Architecture

### 5.1 Data Model Changes

```typescript
// src/types/sketchpad.ts
export type ToolType =
  | 'select'
  | 'pen'
  | 'highlighter'
  | 'eraser'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'text'
  | 'graph';

// Add to Stroke (optional fields for transform)
export type Stroke = {
  // ... existing fields
  transform?: {
    translateX: number;
    translateY: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
  };
};
```

### 5.2 New Utility Functions

In `src/components/sketchpadUtils.ts`:

```typescript
export function buildQuadtree(strokes: Stroke[]): Quadtree;
export function queryQuadtree(tree: Quadtree, rect: Rect): Stroke[];
export function pointInPolygon(point: Point, polygon: Point[]): boolean;
export function lassoSelect(strokes: Stroke[], lassoPath: Point[]): Stroke[];
export function rectSelect(strokes: Stroke[], rect: Rect): Stroke[];
export function transformStroke(
  stroke: Stroke,
  transform: SelectionState['transform'],
): Stroke;
export function getSelectionBounds(strokes: Stroke[]): Rect;
```

### 5.3 Component Changes

| File | Changes |
|------|---------|
| `src/types/sketchpad.ts` | Add `'select'` and `'highlighter'` to `ToolType`; add optional `transform` to `Stroke` |
| `src/components/Sketchpad.tsx` | Add selection mode, transform handles, selection toolbar; update tool bar icons; add highlighter rendering |
| `src/components/sketchpadUtils.ts` | Add quadtree, selection geometry, transform math |
| `src/lib/sketchpad-renderer.ts` | Add highlighter rendering; render selection highlights; stroke culling |
| `src/views/generator/WrittenAnswerCard.tsx` | Refactor to inline expandable sections; auto-export on tab switch; sketch thumbnail |
| `src/views/generator/McAnswerCard.tsx` | Same inline expand pattern |
| `src/views/WrongQuestionView.tsx` | Same inline expand pattern |
| `src/store/sketchpad-sync.ts` | Add history/versioning helpers |

### 5.4 State Machine for Sketchpad

```
Idle → Drawing (pen/eraser/shape) → Commit → Idle
Idle → Selecting (rect/lasso) → Selected → Transforming → Commit → Idle
Idle → Panning (space/middle-click) → Idle
Selected → Delete → Idle
Selected → Duplicate → Selected (new strokes)
```

---

## 6. Edge Cases

### Selection

- **Selecting a single point stroke**: Show selection bounds as a small square
  around the point; allow move/delete but not resize/rotate (or disable handles).
- **Selecting across an eraser stroke**: Eraser strokes are selectable too;
  user can move/delete them just like any other stroke.
- **Transforming past canvas bounds**: Allow it; the canvas is infinite. The
  export bounding box will expand to include transformed strokes.
- **Very small selection (< 10px)**: Treat as a click; if no stroke is hit,
   clear selection.

### Auto-export

- **Tab switch during active drawing**: Cancel the current stroke, commit what
  exists, then export.
- **Empty sketchpad**: Don't create an attachment; show "No sketch to export"
  toast (optional).
- **Rapid tab switching**: Debounce export by 300ms to avoid redundant work.

### Persistence

- **Transform + undo**: The undo snapshot captures the pre-transform stroke
  state. Redo re-applies the transform.
- **Session key change while selecting**: Commit any active transform before
  switching sessions.

---

## 7. Accessibility

- Selection handles must be keyboard-navigable:
  - `Tab` cycles between handles
  - `Arrow keys` nudge the selection 1px
  - `Shift+Arrow` nudges 10px
  - `Shift` during resize maintains aspect ratio
- All new tools must have keyboard shortcuts:
  - `V` or `S` → select
  - `H` → highlighter
- Screen reader: announce "3 strokes selected" when selection changes.

---

## 8. Performance Budget

- Selection hit test: < 2ms for 1000 strokes
- Render frame: < 16ms at 1080p with 500 strokes
- Tab switch auto-export: < 500ms (async, non-blocking)
- Memory: quadtree overhead < 10% of stroke data size

---

## 9. Open Questions / Recommendations

1. **Should the inline expandable sketchpad replace the current tab system
   entirely, or be an optional layout?**
   - *Recommendation*: Replace entirely in `WrittenAnswerCard` and
     `WrongQuestionView`. Keep tabs in `McAnswerCard` (less space).

2. **Should we support multi-touch selection (two-finger box select)?**
   - *Recommendation*: Not in v1. Single-pointer selection + keyboard modifiers
     is sufficient.

3. **Should the equation tool (LaTeX on canvas) be in scope?**
   - *Recommendation*: Mark as v2. It requires significant MathJax integration
     work and the text tool is a usable stopgap.

4. **Should sketches sync to Firebase?**
   - *Recommendation*: Not in this spec. Sketches are large (SVG strings) and
     local-only storage is acceptable. Revisit if users request cross-device
     sketch access.

5. **Should we add a "templates" feature (pre-drawn axes, unit circles, etc.)?**
   - *Recommendation*: Yes as a follow-up. The graph tool is already a template;
   extend with common VCE diagrams (e.g., force diagrams, probability trees).

---

## 10. Implementation Phases

### Phase 1: Selection Tool (highest user value)
- Rectangle + lasso select
- Move, delete, duplicate
- Resize + rotate
- Selection toolbar

### Phase 2: Inline Expandable UX
- Refactor `WrittenAnswerCard` to inline sections
- Auto-export on tab switch
- Sketch thumbnail on text tab

### Phase 3: Performance
- Quadtree hit testing
- Viewport culling
- Layered canvas

### Phase 4: Polish
- Highlighter tool
- Ruler enhancements
- SVG/PDF export
- Sketch history
