/**
 * store.ts — Central Zustand store for application state.
 *
 * This file provides a unified access point for the application's state and actions,
 * which are partitioned into modular slices:
 * - SettingsSlice: App-wide configuration (API keys, models, themes).
 * - SessionSlice: Active generation/marking session state and logic.
 * - HistorySlice: Local history of generated questions and performance stats.
 *
 * Persistence is managed automatically via a debounced subscription to the store,
 * which calls the Tauri backend to save state to a local JSON file.
 */

export * from './store/index';
