# Performance & Sync Latency Optimization Plan

## Context

The app suffers from two categories of performance issues:
1. **React rendering performance** — excessive re-renders, expensive MathJax typesetting, missing memoization
2. **Firebase sync latency** — full data loads on every poll, duplicate event listeners, missing debounce, redundant local persistence writes

This plan addresses both areas with targeted, low-risk changes.

---

## Phase 1: Firebase Sync Latency (Highest Impact)

### 1.1 Pass `getLocalData` to `subscribeToUserData` (P0)

**File:** `src/context/modules/useFirebaseSync.ts:367`

Currently the poll (every 5 min) unconditionally loads all 1100+ docs from Firestore because `getLocalData` is never passed. The delta-check code already exists in `firebase-crud.ts:1107-1119` but is dormant.

**Change:** Pass a `getLocalData` callback that returns the current local syncable data:

```typescript
const unsubscribe = subscribeToUserData(
  userId,
  async (remoteData) => { /* existing callback */ },
  () => localDataRef.current  // NEW: enable delta-checking on polls
);
```

**Impact:** Reduces poll Firestore reads from ~1100 docs to 0-~10 docs when nothing changed. The `getDeltaSyncData` function compares `lastModified` timestamps per-collection and skips `loadUserData` entirely when no items changed.

### 1.2 Consolidate duplicate `visibilitychange` listeners (P0)

**Files:**
- `src/context/modules/useFirebaseSync.ts:848-853` — syncs on visible
- `src/context/FirebaseSyncContext.tsx:43-46` — syncs on hidden

Both register independent `visibilitychange` listeners. On a single tab switch, both can fire.

**Change:** Remove the `visibilitychange` listener from `FirebaseSyncContext.tsx`. The exit-sync logic should rely solely on `beforeunload` and `pagehide` (which are already registered). The `useFirebaseSync.ts` listener handles the "tab becomes visible" case.

**Impact:** Eliminates double `forceSync()` on tab switches.

### 1.3 Add debounce to daily usage sync (P1)

**File:** `src/context/modules/useFirebaseSync.ts:562-566`

The store subscriber fires `syncDailyUsage()` on every generation history change with no debounce.

**Change:** Add a 10-second debounce:

```typescript
let dailyUsageTimer: ReturnType<typeof setTimeout> | null = null;
const unsubscribe = useAppStore.subscribe((state) => {
  if (state.generationHistory.length !== lastSyncedGenCount) {
    if (dailyUsageTimer) clearTimeout(dailyUsageTimer);
    dailyUsageTimer = setTimeout(() => {
      void syncDailyUsage();
    }, 10_000);
  }
});
```

**Impact:** Batches rapid-fire Firestore writes during generation sessions.

### 1.4 Suppress local persistence during Firebase merge (P1)

**File:** `src/context/modules/useFirebaseSync.ts:378-379`

When remote data is merged into the store, the store's auto-persist subscriber writes the full state to local disk — redundant since the data came from the cloud.

**Change:** Add a flag in `store.ts` to suppress the auto-persist subscriber:

```typescript
// store.ts
export let suppressPersistUntil = 0;

useAppStore.subscribe((state) => {
  if (!state.isHydrated) return;
  if (Date.now() < suppressPersistUntil) return;  // ← skip during sync
  // ... existing persist logic
});
```

In `useFirebaseSync.ts`, set `suppressPersistUntil = Date.now() + 1500` before `setState`.

**Impact:** Eliminates redundant full-state local disk writes on every cloud sync.

### 1.5 Add delta-check to `forceSync` (P1)

**File:** `src/context/modules/useFirebaseSync.ts:746-833`

`forceSync` always does a full load + full save even if nothing changed.

**Change:** Before the full save, call `getDeltaSyncData` with the merged data and the pre-merge local data. If no local items changed, skip the `saveUserData` call.

**Impact:** Reduces Firestore writes on idle forceSync calls (e.g., tab switch) from ~1100 writes to 0.

---

## Phase 2: React Rendering Performance

### 2.1 Remove `dynamic` from MathJax (P0 — biggest single win)

**File:** `src/components/MarkdownMath.tsx:13`

The `dynamic` prop forces MathJax to re-typeset LaTeX on every mount/update. MathJax typesetting is CPU-bound and the single most expensive operation in the render path.

**Change:** Remove `dynamic`:

```tsx
<MathJax>
```

**Impact:** MathJax content renders once and stays static. Eliminates re-typesetting on re-renders of `WrittenFeedbackPanel`, `WrongQuestionView`, `McAnswerPanel`, and `CompletionScreen`. This alone should eliminate most visible jank.

**Risk:** If content changes after mount (rare — content is typically static after load), MathJax won't re-typeset. If needed, we can add a `key={content}` prop to force remount only when content actually changes.

### 2.2 Wrap components in `React.memo` (P1)

| Component | File | Issue |
|-----------|------|-------|
| `WrittenFeedbackPanel` | `src/components/generator/WrittenFeedbackPanel.tsx` | Re-renders on every GeneratorView render; contains 10+ MarkdownMath children |
| `SetupPanel` | `src/components/generator/SetupPanel.tsx` | Re-renders on any GeneratorView state change |
| `ListEntryCard` | `src/views/WrongQuestionView.tsx:91` | All virtual rows re-render on expand/collapse |

**Change:** Wrap each in `React.memo()`:

```typescript
export const WrittenFeedbackPanel = memo(function WrittenFeedbackPanel({ ... }) {
  // existing code
});
```

For `SetupPanel`, need to also memoize the callbacks passed as props (see 2.3).

### 2.3 Memoize callbacks in GeneratorView with `useCallback` (P1)

**File:** `src/views/GeneratorView.tsx` (multiple lines)

Inline arrow functions like `onAnswerChange` at line 1474 create new references every render, defeating `React.memo` on children.

**Change:** Wrap key callbacks in `useCallback`:
- `onAnswerChange` (line 1474)
- `onAppealChange` / `onOverrideInputChange` (line 1496)
- `onSubmitAnswer` / `onMarkAnswer`
- SetupPanel callback props (line 1342-1372)

**Impact:** Enables `React.memo` on `WrittenFeedbackPanel`, `SetupPanel`, and `WrittenAnswerCard` to actually skip re-renders.

### 2.4 Hoist `VirtualizedSavedSetList` out of `SavedView` (P1)

**File:** `src/views/SavedView.tsx:128`

The virtualized list component is defined inside the `SavedView` function body. React treats it as a new component type on every render, destroying scroll position and virtualizer state.

**Change:** Move `VirtualizedSavedSetList` to module scope (outside the `SavedView` function).

**Impact:** Preserves scroll position and virtualizer state when typing in search or toggling filters.

### 2.5 Split `useAppContext()` mega-selector (P2)

**File:** `src/AppContext.tsx:59-163`

The `useAppContext()` hook selects ~80 fields. Components using it re-render on any field change.

**Change:** Components that only need specific fields should use direct Zustand selectors instead:

```typescript
// Instead of:
const { isMarking, isGenerating } = useAppContext();

// Use:
const isMarking = useAppStore((s) => s.isMarking);
const isGenerating = useAppStore((s) => s.isGenerating);
```

Start with `GeneratorView.tsx` which uses `useAppContext()` for ~15 fields and could use targeted selectors.

**Impact:** Components only re-render when their specific fields change.

---

## Phase 3: Persistence Layer

### 3.1 Skip image dataUrls in auto-persist snapshot (P2)

**File:** `src/store.ts:862-924` (`buildPersistedSnapshot`)

`imagesByQuestionId` contains base64 `dataUrl` strings (1-5 MB each). Every 500ms debounce serializes these.

**Change:** Exclude `imagesByQuestionId` from the auto-persist snapshot, or at minimum strip `dataUrl` from images older than the current session. Images for the active session are needed for marking; saved set images are stored within saved sets already.

**Impact:** Reduces serialized payload by potentially tens of MB.

### 3.2 Cache `isTauriRuntime()` result (P2)

**File:** `src/lib/persistence.ts`

`isTauriRuntime()` is called on every save/load. The runtime doesn't change during a session.

**Change:** Cache at module level:

```typescript
const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
```

**Impact:** Minor but trivial fix.

---

## Verification

After each phase, verify:
1. `npx tsc --noEmit` — type checking passes
2. `bun run tauri dev` — app starts and functions normally
3. Manual testing: generate questions, save sets, switch tabs, verify sync still works
4. Check browser DevTools Performance tab for reduced scripting time during:
   - Answer typing (should see fewer layout/paint cycles)
   - Tab switching (should see fewer network requests)
   - Generating questions (should see fewer Firestore writes)
