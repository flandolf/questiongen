**State Management (Zustand) Guide**

Overview:

- Global store entry: [src/store.ts](src/store.ts#L1).
- Slices: [src/store/slices](src/store/slices#L1) (history, session, settings,
  etc.).
- Helpers: [src/store/helpers.ts](src/store/helpers.ts#L1) and
  [src/lib/store-helpers.ts](src/lib/store-helpers.ts#L1).
- Persistence: [src/store/persistence.ts](src/store/persistence.ts#L1) handles
  saving/restoring local snapshots; optional Firestore sync handled via
  [src/context/FirebaseSyncContext.tsx](src/context/FirebaseSyncContext.tsx#L1).

Developer notes:

- Be careful updating persisted store shapes; add migrations or versioning when
  necessary.
- Tests: [src/store/**tests**](src/store/__tests__#L1) covers key store
  behaviors.

Example: read/write store

```ts
// read from store
import { useStore } from './store';
const settings = useStore.getState().settings;

// update
useStore.setState((state) => ({
  settings: { ...state.settings, theme: 'midnight' },
}));
```

Persistence snapshot example (pseudo):

```ts
// src/store/persistence.ts
export function saveSnapshot() {
  const s = useStore.getState();
  localStorage.setItem('qg:snapshot', JSON.stringify(s));
}
```
