# QuestionGen 2.0 — Complete Redesign Plan

> **Status**: Draft  
> **Goal**: A clean, Notion-like UI with modular components, best React practices, and VCAA-accurate question generation.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Architecture Changes](#2-architecture-changes)
3. [Design System](#3-design-system)
4. [View-by-View Redesign](#4-view-by-view-redesign)
5. [Component Architecture](#5-component-architecture)
6. [State Management](#6-state-management)
7. [Generation Pipeline](#7-generation-pipeline)
8. [Technical Decisions](#8-technical-decisions)
9. [Migration Strategy](#9-migration-strategy)
10. [Deprecations](#10-deprecations)
11. [VCAA Accuracy](#11-vcaa-accuracy-improvements)

---

## 1. Design Philosophy

**Notion-like elegance × Academic precision.**

The app should feel like a premium workspace where serious study happens. Every pixel serves focus.

### Core Principles

| Principle | Description |
|-----------|-------------|
| **Content-first chrome** | UI elements recede; questions and study material dominate |
| **Whitespace as structure** | Dense panels become breathable, sectioned forms |
| **Typography creates hierarchy** | Spline Sans for UI, JetBrains Mono for data/math |
| **Motion with purpose** | Transitions guide attention, never distract |
| **Progressive disclosure** | Advanced options hidden behind intentional interaction |

### Brand Personality (from PRODUCT.md)

**Academic, Serious, Precise.** The interface evokes confidence, focus, and scholarly rigor. It treats the student's time and education with respect.

### Quality Bar: Flagship

Every detail matters. Spacing, alignment, motion, and interaction states must be production-grade and distinctive. No loud gradients. No "AI slop". Semantic color and whitespace guide the user.

---

## 2. Architecture Changes

### 2.1 Frontend Architecture

| Area | Current | Proposed |
|---|---|---|
| **Routing** | Manual view state in Zustand | **TanStack Router** — file-based, type-safe, deep-linkable |
| **State** | Zustand slices, some cross-contamination | **Zustand** retained but restructured into strict domain slices |
| **Data Fetching** | Direct Tauri invokes + local state | **TanStack Query** for server-state (generation, marking, sync) |
| **Components** | Mixed organization, large views | **Atomic design** — atoms/molecules/organisms/templates/pages |
| **Styling** | Tailwind 4 + scattered CSS files | **Tailwind 4** + **CSS custom properties design tokens** |
| **Forms** | Manual state + onChange handlers | **React Hook Form** + **Zod** for all configuration inputs |
| **Animations** | ad-hoc | **Framer Motion** for layout animations, AnimatePresence |

### 2.2 Backend (Tauri/Rust)

**Preserve largely as-is.** The Rust generation pipeline, LaTeX protection, and schema validation are well-architected.

**Refinements:**
- Refactor command surface in `lib.rs` to clearer REST-like naming
- Add structured error types mappable to user-friendly frontend messages
- Consider streaming responses if OpenRouter supports it

---

## 3. Design System

### 3.1 Token System

Replace per-theme CSS files with a **CSS custom property token system**. See `src/styles/tokens.css`.

**Token categories:**
- `surface-*` — Background layers (primary, secondary, tertiary, hover)
- `text-*` — Typography colors (primary, secondary, tertiary, inverted)
- `accent-*` — Interactive colors (primary, hover, subtle)
- `border-*` — Separator colors (subtle, hover, focus)
- `space-*` — Spacing scale (1–12)
- `radius-*` — Border radius (sm, md, lg, full)
- `shadow-*` — Elevation (sm, md, lg, xl)
- `font-*` — Type scale (xs through 3xl, mono variant)

Themes become **token overrides**, not separate files. Four core themes:
1. **Light** (default) — warm off-white surfaces, charcoal text
2. **Dark** — deep slate surfaces, soft white text
3. **Academic** — light with VCAA blue accents
4. **High Contrast** — accessibility-first

### 3.2 Typography Scale

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `font-3xl` | 30px | 700 | Page titles |
| `font-2xl` | 24px | 600 | Section headings |
| `font-xl` | 20px | 600 | Card titles |
| `font-lg` | 18px | 500 | Subsection headings |
| `font-base` | 16px | 400 | Body text |
| `font-sm` | 14px | 400 | Secondary text, labels |
| `font-xs` | 12px | 500 | Captions, badges, timestamps |
| `font-mono` | 14px | 400 | Code, math, data |

### 3.3 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `space-1` | 4px | Tight padding, icon gaps |
| `space-2` | 8px | Inline spacing, small gaps |
| `space-3` | 12px | Component internal padding |
| `space-4` | 16px | Standard padding, card gutters |
| `space-5` | 20px | Form section gaps |
| `space-6` | 24px | Card padding, modal internal |
| `space-8` | 32px | Section gaps |
| `space-10` | 40px | Page-level vertical rhythm |
| `space-12` | 48px | Major section dividers |

---

## 4. View-by-View Redesign

### 4.1 Generator View → "Study Session Composer"

**Current problems:** Dense form, overwhelming on first load, inline advanced options.

**New design:**
- Clean, sectioned form with generous whitespace
- Subject selector with search
- Subtopic chips with AI-suggest popover (not modal)
- Question mix sliders (MC / Short Answer / Extended Response)
- Difficulty as segmented control (Easy / Medium / Hard / Exam-style)
- Advanced options in collapsible accordion
- Live cost estimator footer
- "Generate" button with loading animation

**Key interactions:**
- Save configuration as named preset
- Quick-start from recent presets in sidebar
- Inline validation with Zod

### 4.2 Question Player → "Session Player"

Currently questions appear inline or in modals. **New: Immersive player route** (`/session/:id`).

- Full focus mode with minimal chrome
- Questions displayed one at a time
- MathJax in a contained card with subtle shadow
- Sketchpad slides out from right (not bottom)
- Timer in floating header pill
- Navigation: previous/next, flag for review
- After completion: review screen with accuracy summary

### 4.3 History View → "Study Log"

Database-style view (Notion table aesthetic):
- Columns: Title, Subject, Date, Score, Duration, Actions
- Sortable by any column
- Filter sidebar (subject, date range, score range)
- Bulk actions (delete, export to Anki)
- Click row → open session detail overlay
- Alternative views: List, Calendar, Kanban by subject

### 4.4 Saved View → "Question Bank"

Individual question management:
- Database view with columns: Question preview, Subject, Tags, Difficulty, Last reviewed
- Tags are user-defined (Notion properties style)
- Times attempted counter
- Spaced-repetition "due for review" indicator
- Export to Anki per-question or bulk
- Full-text search across question text

### 4.5 Analytics View → "Insights"

Clean dashboard cards:
- **Study streak** — calendar heatmap
- **Subject breakdown** — donut chart
- **Accuracy over time** — line chart
- **Time per question type** — bar chart
- **Cost tracking** — cumulative spend line chart
- **Mastery by subtopic** — radar chart or progress bars

### 4.6 PDF Marker → "Exam Scanner"

Streamlined three-step flow:
1. **Upload** — drag-drop zone with file type validation
2. **Review** — side-by-side PDF + extracted text (editable)
3. **Results** — table of marks with expandable AI feedback per question

### 4.7 Tutor / Wrong Questions → "Study Queue"

Unified "needs attention" view:
- Questions you got wrong
- AI-flagged "needs practice" items
- Due for review (spaced repetition)
- Each item: question preview, reason in queue, action buttons (Practice now, Mark as known, Snooze)

### 4.8 Settings → "Preferences"

Sidebar-organized sections:
- **Account** — API keys, sync status, usage
- **Appearance** — theme, text size, density (compact/comfortable)
- **Generation** — default model, cost limits, diversity
- **Notifications** — study reminders (if implemented)
- **Data** — export, import, backup, clear history
- **About** — version, credits, open-source licenses

---

## 5. Component Architecture

See `docs/component-spec.md` for the detailed specification of every component.

**High-level structure:**

```
src/
├── components/
│   ├── ui/              # Atomic primitives (~20 components)
│   ├── layout/          # App shell, sidebar, header
│   ├── question/        # Question display, player, sketchpad
│   ├── generator/       # Session composer pieces
│   ├── study-log/       # History/session views
│   ├── insights/        # Analytics charts
│   └── common/          # Empty states, loading, errors
├── views/               # Thin page components
├── routes/              # TanStack Router file routes
├── store/               # Zustand domain slices
├── hooks/               # Reusable logic
├── lib/                 # Utilities
└── styles/              # Tokens, globals, theme overrides
```

---

## 6. State Management

### Slice Structure

| Slice | Responsibility |
|-------|---------------|
| `ui-slice` | Sidebar, theme, toasts, modals, command palette |
| `generator-slice` | Configuration, presets, generation status |
| `sessions-slice` | Study sessions, active session, filters |
| `questions-slice` | Question bank, tags, selection |
| `study-queue-slice` | Wrong questions, review schedule |
| `settings-slice` | User preferences, API keys |

### Rules

1. **Slices never import from each other.** Compose in components.
2. **Persistence in middleware only.** Slices are pure.
3. **Server-state in TanStack Query.** Generation, marking, sync.
4. **Form state in React Hook Form.** Until explicit submission.

---

## 7. Generation Pipeline

**The Rust backend is solid. Preserve and polish.**

### Proposed Enhancements

1. **Structured errors:**
   ```rust
   enum GenerationError {
       InvalidConfig(String),
       ModelUnavailable(String),
       RateLimited,
       ParseError(String),
       CostLimitExceeded { estimated: f64, limit: f64 },
   }
   ```

2. **Streaming (if supported):**
   - Stream partial questions to frontend
   - Live "Generating 3 of 10..." progress

3. **VCAA compliance validation:**
   - Post-generation check against study design
   - Alignment score per question
   - Flag deprecated terminology

---

## 8. Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Router | TanStack Router | Type-safe, file-based, deep-linkable |
| Forms | React Hook Form + Zod | Performance, validation, less boilerplate |
| Styling | Tailwind 4 + CSS tokens | Utility-first + systematic theming |
| Animations | Framer Motion | Layout animations, gesture support |
| Charts | Recharts | React-native, customizable |
| Icons | Lucide React | Consistent, lightweight, academic feel |
| Date handling | date-fns | Tree-shakeable, functional |
| Virtualization | @tanstack/react-virtual | Long list performance |

---

## 9. Migration Strategy

### Phase 1: Foundation (2–3 weeks)
- [ ] Set up TanStack Router and restructure routes
- [ ] Build atomic UI component library (`src/components/ui/`)
- [ ] Implement design token system and theme provider
- [ ] Create layout shell (AppShell with sidebar + main)
- [ ] Add command palette skeleton
- [ ] Set up React Hook Form + Zod patterns

### Phase 2: Core Views (3–4 weeks)
- [ ] Redesign Generator View (Session Composer)
- [ ] Build Question Player with sketchpad
- [ ] Implement Study Log database view
- [ ] Redesign Question Bank

### Phase 3: Supporting Views (2 weeks)
- [ ] Insights/Analytics with new charts
- [ ] Exam Scanner (PDF Marker) redesign
- [ ] Study Queue unification
- [ ] Preferences/settings overhaul

### Phase 4: Polish & Backend (2 weeks)
- [ ] Framer Motion transitions throughout
- [ ] Keyboard shortcuts
- [ ] Rust structured errors
- [ ] VCAA compliance enhancements
- [ ] Performance optimization
- [ ] Mobile responsive pass

### Phase 5: Testing & Launch (1–2 weeks)
- [ ] End-to-end generation flow testing
- [ ] Accessibility audit
- [ ] Cross-theme visual regression
- [ ] Beta user feedback

---

## 10. Deprecations

| Item | Action |
|---|---|
| `src/App.css` | Delete — replace with tokens + Tailwind |
| `src/themes/*.css` (12 files) | Reduce to 4 core theme overrides |
| `src/views/generator/SetupPanel.tsx` | Replace with `SessionComposer` |
| Inline `style={{}}` props | Replace with Tailwind classes |
| Manual view state in store | Replace with router |
| `src/components/Sketchpad.tsx` | Refactor into `SketchpadPanel` |
| Legacy modal system | Replace with Dialog primitive |

---

## 11. VCAA Accuracy Improvements

### 11.1 Study Design Ingestion

Parse `.md` study designs into structured JSON:
- Key knowledge points per area
- Key skills per area
- Acceptable question formats per unit
- Glossary of required terminology

### 11.2 Prompt Enrichment

Inject relevant study design excerpts into generation prompts based on selected subtopics. Example:

> "Generate a question about Functions and Graphs. Key knowledge: domain, range, inverse functions. Key skills: sketch graphs, find asymptotes. Acceptable formats: multiple choice (2 marks), short answer (3 marks), extended response (6 marks)."

### 11.3 Post-Generation Validation

- Answer format matches VCAA expectations (working required for 3+ marks)
- Terminology matches study design glossary
- Flag questions using deprecated or non-standard terms
- Difficulty aligns with mark allocation

### 11.4 Alignment Scoring

Each question receives a `vcaaAlignment` score (0–100):
- **90–100**: Exam-quality, perfectly aligned
- **70–89**: Good, minor deviations
- **50–69**: Acceptable, some issues
- **< 50**: Needs revision

Displayed as a confidence badge on every question.

---

## Appendix: File Inventory for Phase 1

| New File | Purpose |
|----------|---------|
| `src/styles/tokens.css` | CSS custom property design tokens |
| `src/styles/globals.css` | Tailwind directives + base styles |
| `src/styles/themes/light.css` | Light theme token overrides |
| `src/styles/themes/dark.css` | Dark theme token overrides |
| `src/components/ui/button.tsx` | Button primitive |
| `src/components/ui/input.tsx` | Input primitive |
| `src/components/ui/dialog.tsx` | Dialog/Modal primitive |
| `src/components/ui/tooltip.tsx` | Tooltip primitive |
| `src/components/ui/badge.tsx` | Badge primitive |
| `src/components/ui/skeleton.tsx` | Loading skeleton |
| `src/components/ui/toast.tsx` | Toast notification |
| `src/components/ui/command.tsx` | Command palette base |
| `src/components/ui/select.tsx` | Select dropdown |
| `src/components/ui/slider.tsx` | Range slider |
| `src/components/ui/switch.tsx` | Toggle switch |
| `src/components/ui/tabs.tsx` | Tab group |
| `src/components/ui/accordion.tsx` | Collapsible sections |
| `src/components/ui/separator.tsx` | Divider line |
| `src/components/ui/scroll-area.tsx` | Custom scrollbar |
| `src/components/ui/popover.tsx` | Floating popover |
| `src/components/ui/dropdown-menu.tsx` | Dropdown menu |
| `src/components/ui/context-menu.tsx` | Right-click menu |
| `src/components/ui/calendar.tsx` | Date picker calendar |
| `src/components/ui/avatar.tsx` | User avatar |
| `src/components/ui/textarea.tsx` | Multi-line input |
| `src/components/ui/label.tsx` | Form label |
| `src/components/ui/checkbox.tsx` | Checkbox input |
| `src/components/ui/radio-group.tsx` | Radio button group |
| `src/components/layout/AppShell.tsx` | Root layout wrapper |
| `src/components/layout/Sidebar.tsx` | Navigation sidebar |
| `src/components/layout/Header.tsx` | Top bar |
| `src/components/layout/CommandPalette.tsx` | Global command search |
| `src/routes/__root.tsx` | Root route layout |
| `src/routes/index.tsx` | Home / redirect |
| `src/routes/generator.tsx` | Generator page |
| `src/store/slices/ui-slice.ts` | UI state |
