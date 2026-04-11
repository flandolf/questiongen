## 2025-05-14 - Redundant Store Persistence
**Learning:** The Zustand store subscription in `src/store.ts` currently triggers a full serialization and disk write on every state change. Many of these changes are transient (e.g., timer ticks, loading flags) and do not affect the persisted snapshot.
**Action:** Implement a deep equality check (`hasMeaningfulChange`) to compare the current persisted snapshot against the last saved one, skipping the save if they are identical.
