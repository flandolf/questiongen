import { beforeEach, describe, expect, it } from 'vitest';

import { useAppStore } from '../index';

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store to default state if possible, or use a fresh store
    // Since Zustand stores are singletons in this setup, we might need to manually reset
    // Manual reset of some key properties for testing
    useAppStore.setState({
        apiKey: '',
        model: 'gpt-4o',
        questions: [],
        mcQuestions: [],
        selectedTopics: [],
    });
  });

  it('should have initial state', () => {
    const state = useAppStore.getState();
    expect(state.apiKey).toBe('');
    expect(state.isGenerating).toBe(false);
  });

  it('should update API key', () => {
    useAppStore.getState().setApiKey('test-key');
    expect(useAppStore.getState().apiKey).toBe('test-key');
  });

  it('should update selected topics', () => {
    useAppStore.getState().setSelectedTopics(['Math']);
    expect(useAppStore.getState().selectedTopics).toEqual(['Math']);
  });

  it('should add log entries', () => {
    useAppStore.getState().addLog({ message: 'test log', type: 'info' });
    const logs = useAppStore.getState().logs;
    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('test log');
  });

  it('should clear logs', () => {
    useAppStore.getState().addLog({ message: 'test log', type: 'info' });
    useAppStore.getState().clearLogs();
    expect(useAppStore.getState().logs).toHaveLength(0);
  });
});