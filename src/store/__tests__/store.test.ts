import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '@/store/index';

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store to default state if possible, or use a fresh store
    // Since Zustand stores are singletons in this setup, we might need to manually reset
    // Manual reset of some key properties for testing
    useAppStore.setState({
      model: '',
      questions: [],
      mcQuestions: [],
      selectedTopics: [],
    });
  });

  it('should have initial state', () => {
    const state = useAppStore.getState();
    expect(state.model).toBe('');
    expect(state.isGenerating).toBe(false);
  });

  it('should update the ChatGPT model', () => {
    useAppStore.getState().setModel('gpt-5.6-sol');
    expect(useAppStore.getState().model).toBe('gpt-5.6-sol');
  });

  it('should update selected topics', () => {
    useAppStore.getState().setSelectedTopics(['Mathematical Methods']);
    expect(useAppStore.getState().selectedTopics).toEqual([
      'Mathematical Methods',
    ]);
  });

  it('should add log entries', () => {
    useAppStore.getState().addLog({ message: 'test log', level: 'info' });
    const logs = useAppStore.getState().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('test log');
  });

  it('should clear logs', () => {
    useAppStore.getState().addLog({ message: 'test log', level: 'info' });
    useAppStore.getState().clearLogs();
    expect(useAppStore.getState().logs).toHaveLength(0);
  });
});
