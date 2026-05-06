import type { StateCreator } from 'zustand';

import {
  loadAllCustomSubtopics as loadAllCustomSubtopicsFromFirebase,
  saveCustomSubtopics as saveCustomSubtopicsToFirebase,
} from '@/context/modules/sync/mutations';
import type { AppActions, AppState } from '@/store/types';
import type { CustomSubtopic, Topic } from '@/types';

export interface CustomSubtopicsSlice {
  customSubtopics: Record<Topic, CustomSubtopic[]>;
  isLoadingCustomSubtopics: boolean;
  customSubtopicsSynced: boolean;

  syncCustomSubtopics: () => Promise<void>;
  addCustomSubtopic: (topic: Topic, subtopic: CustomSubtopic) => Promise<void>;
  updateCustomSubtopic: (
    topic: Topic,
    subtopic: CustomSubtopic,
  ) => Promise<void>;
  deleteCustomSubtopic: (topic: Topic, subtopicId: string) => Promise<void>;
}

export const createCustomSubtopicsSlice: StateCreator<
  AppState & AppActions,
  [],
  [],
  CustomSubtopicsSlice
> = (set, get) => ({
  customSubtopics: {
    Biology: [],
    Chemistry: [],
    'General Mathematics': [],
    'Mathematical Methods': [],
    'Physical Education': [],
    'Specialist Mathematics': [],
  },
  isLoadingCustomSubtopics: false,
  customSubtopicsSynced: false,

  syncCustomSubtopics: async () => {
    const state = get();
    if (state.customSubtopicsSynced) return;

    set({ isLoadingCustomSubtopics: true });
    try {
      const topics: Topic[] = [
        'Biology',
        'Chemistry',
        'General Mathematics',
        'Mathematical Methods',
        'Physical Education',
        'Specialist Mathematics',
      ];

      const remoteMap = await loadAllCustomSubtopicsFromFirebase();

      const merged: Record<Topic, CustomSubtopic[]> = {
        ...state.customSubtopics,
      };

      for (const topic of topics) {
        const remoteEntry = remoteMap[topic as string];
        if (!remoteEntry) continue;

        const remoteUpdatedAt = remoteEntry.updatedAt ?? 0;
        const localList = state.customSubtopics[topic] || [];
        const localLatest =
          localList.length > 0
            ? Math.max(...localList.map((s) => s.updatedAt || s.createdAt || 0))
            : 0;

        // If remote is newer, adopt remote; otherwise keep local (local changes win).
        if (remoteUpdatedAt > localLatest) {
          merged[topic] = remoteEntry.subtopics;
        }
      }

      set({
        customSubtopics: merged,
        customSubtopicsSynced: true,
        isLoadingCustomSubtopics: false,
      });
    } catch (error) {
      console.error('Failed to sync custom subtopics:', error);
      set({ isLoadingCustomSubtopics: false });
    }
  },

  addCustomSubtopic: async (topic: Topic, subtopic: CustomSubtopic) => {
    const state = get();
    const current = state.customSubtopics[topic] || [];
    const updated = [...current, subtopic];

    set((state) => ({
      customSubtopics: {
        ...state.customSubtopics,
        [topic]: updated,
      },
    }));

    await saveCustomSubtopicsToFirebase(topic, updated);
  },

  updateCustomSubtopic: async (topic: Topic, subtopic: CustomSubtopic) => {
    const state = get();
    const current = state.customSubtopics[topic] || [];
    const updated = current.map((s) => (s.id === subtopic.id ? subtopic : s));

    set((state) => ({
      customSubtopics: {
        ...state.customSubtopics,
        [topic]: updated,
      },
    }));

    await saveCustomSubtopicsToFirebase(topic, updated);
  },

  deleteCustomSubtopic: async (topic: Topic, subtopicId: string) => {
    const state = get();
    const current = state.customSubtopics[topic] || [];
    const updated = current.filter((s) => s.id !== subtopicId);

    set((state) => ({
      customSubtopics: {
        ...state.customSubtopics,
        [topic]: updated,
      },
    }));

    await saveCustomSubtopicsToFirebase(topic, updated);
  },
});
