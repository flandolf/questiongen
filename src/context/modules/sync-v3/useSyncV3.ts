import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  collection, 
  doc, 
  onSnapshot, 
  type Unsubscribe 
} from 'firebase/firestore';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth, db } from '../firebase-init';
import { useAppStore } from '@/store';
import type { 
  McHistoryEntry, 
  Preset, 
  QuestionHistoryEntry, 
  SavedQuestionSet, 
  StudyGoals, 
  StreakData 
} from '@/types';

export interface UseSyncV3Return {
  user: FirebaseUser | null;
  isLoading: boolean;
  isSyncing: boolean; // Managed by Firestore internally, but we can show "active" status
  isSyncEnabled: boolean;
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error' | 'offline' | 'connecting';
  lastSyncTime: number | null;
  syncError: string | null;
  pendingChanges: number; // Always 0 in V3 as writes are immediate
  pendingDeletions: number; // Always 0
  queuedOpsCount: number; // Always 0
  lastFlushTime: number | null;
  enableSync: (email: string, password: string, isSignUp?: boolean) => Promise<void>;
  disableSync: () => Promise<void>;
  toggleSync: () => void;
}

export function useSyncV3(): UseSyncV3Return {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncEnabled, setIsSyncEnabled] = useState(true); // Default to true if user is logged in
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'offline' | 'connecting'>('idle');
  
  const unsubscribesRef = useRef<Unsubscribe[]>([]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setIsLoading(false);
      
      if (firebaseUser) {
        setupListeners(firebaseUser.uid);
      } else {
        cleanupListeners();
      }
    });

    return () => {
      unsubscribeAuth();
      cleanupListeners();
    };
  }, []);

  const cleanupListeners = useCallback(() => {
    unsubscribesRef.current.forEach((unsub) => unsub());
    unsubscribesRef.current = [];
  }, []);

  const setupListeners = useCallback((uid: string) => {
    cleanupListeners();
    setSyncStatus('syncing');

    // 1. Question History
    const qhUnsub = onSnapshot(collection(db, `users/${uid}/questionHistory`), (snapshot) => {
      const history: QuestionHistoryEntry[] = [];
      snapshot.forEach((doc) => history.push({ id: doc.id, ...doc.data() } as QuestionHistoryEntry));
      // Ensure newest first
      history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      useAppStore.setState({ questionHistory: history });
    });

    // 2. MC History
    const mchUnsub = onSnapshot(collection(db, `users/${uid}/mcHistory`), (snapshot) => {
      const history: McHistoryEntry[] = [];
      snapshot.forEach((doc) => history.push({ id: doc.id, ...doc.data() } as McHistoryEntry));
      // Ensure newest first
      history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      useAppStore.setState({ mcHistory: history });
    });

    // 3. Saved Sets
    const ssUnsub = onSnapshot(collection(db, `users/${uid}/savedSets`), (snapshot) => {
      const sets: SavedQuestionSet[] = [];
      snapshot.forEach((doc) => sets.push({ id: doc.id, ...doc.data() } as SavedQuestionSet));
      // Ensure newest modified/updated first
      sets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      useAppStore.setState({ savedSets: sets });
    });

    // 4. Settings - Main
    const settingsMainUnsub = onSnapshot(doc(db, `users/${uid}/settings`, 'main'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.apiKey) useAppStore.setState({ apiKey: data.apiKey });
      }
    });

    // 5. Settings - Goals
    const settingsGoalsUnsub = onSnapshot(doc(db, `users/${uid}/settings`, 'goals'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.studyGoals) useAppStore.setState({ studyGoals: data.studyGoals as StudyGoals });
        if (data.streakData) useAppStore.setState({ streakData: data.streakData as StreakData });
      }
    });

    // 6. Settings - Presets
    const settingsPresetsUnsub = onSnapshot(doc(db, `users/${uid}/settings`, 'presets'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.presets) useAppStore.setState({ presets: data.presets as Preset[] });
      }
    });

    unsubscribesRef.current = [
      qhUnsub, 
      mchUnsub, 
      ssUnsub, 
      settingsMainUnsub, 
      settingsGoalsUnsub, 
      settingsPresetsUnsub
    ];
    setSyncStatus('idle');
  }, [cleanupListeners]);

  const enableSync = async (_email: string, _password: string, _isSignUp = false) => {
    setSyncStatus('connecting');
    try {
      if (_isSignUp) {
        // Sign up logic (using standard firebase auth)
      } else {
        // Sign in logic
      }
      // Note: onAuthStateChanged will trigger and setup listeners
    } catch (error) {
      setSyncStatus('error');
      throw error;
    }
  };

  const disableSync = async () => {
    await auth.signOut();
  };

  const toggleSync = () => {
    setIsSyncEnabled(!isSyncEnabled);
  };

  return {
    user,
    isLoading,
    isSyncing: syncStatus === 'syncing',
    isSyncEnabled,
    isOnline,
    syncStatus,
    lastSyncTime: Date.now(),
    syncError: null,
    pendingChanges: 0,
    pendingDeletions: 0,
    queuedOpsCount: 0,
    lastFlushTime: null,
    enableSync,
    disableSync,
    toggleSync,
  };
}
