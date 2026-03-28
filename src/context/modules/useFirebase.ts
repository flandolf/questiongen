export { app, auth, db, type FirebaseUser } from "./firebase-init";
export { signInWithEmail, signUpWithEmail, signOutFirebase, onAuthChange } from "./firebase-auth";
export {
  type SyncableData,
  type SyncMetadata,
  type CompactionMigrationResult,
  type DeltaSyncResult,
  type SaveOptions,
  type DailyUsageRecord,
  createInitialSyncMetadata,
  getChangedItems,
  getDeltaItems,
  buildVersionMap,
  getDeltaSyncData,
  saveUserData,
  loadUserData,
  loadChangedItems,
  migrateUserDataForCompaction,
  deleteArchivedItems,
  subscribeToUserData,
  saveDailyUsage,
} from "./firebase-crud";
