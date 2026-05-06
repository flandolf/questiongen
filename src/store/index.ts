import { create } from 'zustand';

import { mergeImportedState, persistAndRehydrate } from '@/lib/import-export';
import { loadPersistedAppState } from '@/lib/persistence';

import {
  setLastSavedSnapshot,
  setupPersistence,
  snapshotToState,
} from './persistence';
import { createCustomSubtopicsSlice } from './slices/custom-subtopics-slice';
import { createHistorySlice } from './slices/history-slice';
import { createPdfMarkerSlice } from './slices/pdf-marker-slice';
import { createSessionSlice } from './slices/session-slice';
import { createSettingsSlice } from './slices/settings-slice';
import type { AppActions, AppState } from './types';

export { buildPersistedSnapshot, snapshotToState } from './persistence';
export type { AppActions, AppState } from './types';

export const useAppStore = create<AppState & AppActions>()(
  (set, get, store) => ({
    ...createSettingsSlice(set, get, store),
    ...createSessionSlice(set, get, store),
    ...createHistorySlice(set, get, store),
    ...createPdfMarkerSlice(set, get, store),
    ...createCustomSubtopicsSlice(set, get, store),

    isHydrated: false,

    hydrate: async () => {
      console.info('Hydrating app store from persistent storage...');
      try {
        const persisted = await loadPersistedAppState();
        setLastSavedSnapshot(persisted);

        set({
          ...snapshotToState(persisted),
          isHydrated: true,
        });
        console.info('Hydration successful', {
          version: persisted.version,
          savedSetsCount: persisted.savedSets.length,
          historyCount: persisted.questionHistory.length,
        });
      } catch (err) {
        console.error('Hydration failed', err);
        set({
          errorMessage: 'Could not load saved app data.',
          isHydrated: true,
        });
      }
    },

    importState: (imported) => {
      const s = get();
      const merged = mergeImportedState(s, imported);
      set(merged as Partial<AppState & AppActions>);
      void persistAndRehydrate(get());
    },
  }),
);

setupPersistence(useAppStore);
