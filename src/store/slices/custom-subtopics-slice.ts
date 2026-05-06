import type { StateCreator } from 'zustand';

import {
  loadCustomSubtopics as loadCustomSubtopicsFromFirebase,
  saveCustomSubtopics as saveCustomSubtopicsToFirebase,
} from '@/context/modules/sync/mutations';
import type { AppActions, AppState } from '@/store/types';
import type { CustomSubtopic, Topic } from '@/types';

export interface CustomSubtopicsSlice {
  customSubtopics: Record<Topic, CustomSubtopic[]>;
  isLoadingCustomSubtopics: boolean;

  loadCustomSubtopics: (topic: Topic) => Promise<void>;
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

  loadCustomSubtopics: async (topic: Topic) => {
    set({ isLoadingCustomSubtopics: true });
    try {
      const subtopics = await loadCustomSubtopicsFromFirebase(topic);
      set((state) => ({
        customSubtopics: {
          ...state.customSubtopics,
          [topic]: subtopics,
        },
        isLoadingCustomSubtopics: false,
      }));
    } catch (error) {
      console.error('Failed to load custom subtopics:', error);
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
