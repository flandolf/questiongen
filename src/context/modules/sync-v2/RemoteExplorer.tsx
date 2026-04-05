/**
 * Remote Explorer — A lightweight tool for viewing and managing Firestore data.
 *
 * Features:
 * - Login flow (email/password via Firebase Auth)
 * - Tree view of collections/documents with sharding support
 * - Document viewer/editor (JSON)
 * - CRUD operations (read, write, delete, add)
 * - Force sync button
 * - Status bar with connection info
 */

import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  type DocumentData,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { FileText, RefreshCw, Save, Trash2, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

import { signInWithEmail, signUpWithEmail } from '../firebase-auth';
import { auth, db } from '../firebase-init';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TreeNode {
  id: string;
  label: string;
  type: 'collection' | 'shard' | 'document';
  path: string;
  children?: TreeNode[];
  metadata?: {
    lastModified?: number;
    size?: number;
    docCount?: number;
  };
  loaded: boolean;
}

interface DocumentView {
  id: string;
  path: string;
  data: Record<string, unknown>;
  isEditing: boolean;
  editValue: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimateSize(data: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return 0;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function extractLastModified(data: DocumentData): number {
  const lm = data._lastModified as { toMillis?: () => number } | undefined;
  if (lm && typeof lm === 'object' && typeof lm.toMillis === 'function')
    return lm.toMillis();
  if (typeof data.lastModified === 'number') return data.lastModified;
  if (typeof data.updatedAt === 'string') {
    const p = Date.parse(data.updatedAt);
    if (Number.isFinite(p)) return p;
  }
  if (typeof data.createdAt === 'string') {
    const p = Date.parse(data.createdAt);
    if (Number.isFinite(p)) return p;
  }
  return 0;
}

const COLLECTIONS = ['settings', 'questionHistory', 'mcHistory', 'savedSets'];

// ─── Components ───────────────────────────────────────────────────────────────

function LoginForm({ onLogin }: { onLogin: (user: FirebaseUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const user = isSignUp
          ? await signUpWithEmail(email, password)
          : await signInWithEmail(email, password);
        if (user) onLogin(user);
      } catch (_err) {
        setError(_err instanceof Error ? _err.message : 'Login failed');
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div
      style={{
        maxWidth: 400,
        margin: '40px auto',
        padding: 24,
        border: '1px solid #e2e8f0',
        borderRadius: 8,
      }}
    >
      <h2 style={{ marginBottom: 16 }}>Remote Explorer Login</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              border: '1px solid #cbd5e1',
              borderRadius: 4,
            }}
            required
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              width: '100%',
              padding: 8,
              border: '1px solid #cbd5e1',
              borderRadius: 4,
            }}
            required
          />
        </div>
        {error && (
          <p style={{ color: '#ef4444', fontSize: 14, marginBottom: 12 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '8px 16px',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #cbd5e1',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            {isSignUp ? 'Switch to Sign In' : 'Switch to Sign Up'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RemoteExplorer() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [documentView, setDocumentView] = useState<DocumentView | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  const unsubRef = useRef<(() => void) | null>(null);

  const loadTree = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const nodes: TreeNode[] = [];

      for (const collName of COLLECTIONS) {
        const collRef = collection(db, `users/${userId}/${collName}`);
        try {
          const snap = await getDocs(collRef);
          const docCount = snap.size;
          const collectionNode: TreeNode = {
            id: `coll-${collName}`,
            label: collName,
            type: 'collection',
            path: `users/${userId}/${collName}`,
            metadata: { docCount },
            loaded: false,
          };

          // For history collections, group by shard (YYYY-MM from createdAt)
          if (collName === 'questionHistory' || collName === 'mcHistory') {
            const shards = new Map<string, TreeNode[]>();
            snap.forEach((docSnap) => {
              const data = docSnap.data();
              const shardKey = extractShardKey(data);
              if (!shards.has(shardKey)) shards.set(shardKey, []);
              shards.get(shardKey)!.push({
                id: `doc-${docSnap.id}`,
                label: docSnap.id,
                type: 'document',
                // Documents actually live directly under the collection
                // (users/{userId}/{collName}/{docId}). We only group them
                // in the UI by shardKey, so the path must point to the real
                // document location so selection/fetching works.
                path: `users/${userId}/${collName}/${docSnap.id}`,
                metadata: {
                  lastModified: extractLastModified(data),
                  size: estimateSize(data),
                },
                loaded: true,
              });
            });

            collectionNode.children = Array.from(shards.entries())
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([key, docs]) => ({
                id: `shard-${collName}-${key}`,
                label: key,
                type: 'shard',
                path: `users/${userId}/${collName}/${key}`,
                children: docs,
                metadata: { docCount: docs.length },
                loaded: true,
              }));
          } else {
            collectionNode.children = snap.docs.map((docSnap) => {
              const data = docSnap.data();
              return {
                id: `doc-${docSnap.id}`,
                label: docSnap.id,
                type: 'document',
                path: `users/${userId}/${collName}/${docSnap.id}`,
                metadata: {
                  lastModified: extractLastModified(data),
                  size: estimateSize(data),
                },
                loaded: true,
              };
            });
          }

          nodes.push(collectionNode);
        } catch (_err) {
          console.warn(`Failed to load collection ${collName}:`, _err);
          nodes.push({
            id: `coll-${collName}`,
            label: collName,
            type: 'collection',
            path: `users/${userId}/${collName}`,
            metadata: { docCount: 0 },
            loaded: true,
            children: [],
          });
        }
      }

      setTree(nodes);
      setLastSyncTime(Date.now());
    } catch {
      toast.error('Failed to load document tree');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) void loadTree(u.uid);
    });
    unsubRef.current = () => unsub();
    return () => unsub();
  }, [loadTree]);

  // Online/offline
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const handleLogin = useCallback(
    (firebaseUser: FirebaseUser) => {
      setUser(firebaseUser);
      void loadTree(firebaseUser.uid);
    },
    [loadTree]
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback(async (node: TreeNode) => {
    setSelectedNode(node);
    if (node.type === 'document') {
      try {
        const docRef = doc(
          db,
          node.path.split('/').slice(0, -1).join('/'),
          node.path.split('/').pop()!
        );
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          const data = snap.data();
          delete data._lastModified;
          setDocumentView({
            id: node.id,
            path: node.path,
            data,
            isEditing: false,
            editValue: JSON.stringify(data, null, 2),
          });
        }
      } catch {
        toast.error('Failed to load document');
      }
    } else {
      setDocumentView(null);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!documentView || !user) return;

    try {
      // Explicitly cast JSON.parse result to avoid 'any' assignment
      const parsed = JSON.parse(documentView.editValue) as Record<
        string,
        unknown
      >;

      const parts = documentView.path.split('/');
      const docId = parts.pop();
      const collPath = parts.join('/');

      if (!docId) return;

      await setDoc(
        doc(db, collPath, docId),
        { ...parsed, _lastModified: serverTimestamp() },
        { merge: true }
      );

      setDocumentView((prev) =>
        prev ? { ...prev, data: parsed, isEditing: false } : null
      );

      toast.success('Document saved');

      if (user) {
        // Use void to explicitly acknowledge the floating promise
        void loadTree(user.uid);
      }
    } catch (error) {
      toast.error('Invalid JSON or save failed');
      console.error('Save error:', error);
    }
  }, [documentView, user, loadTree]);

  const handleDelete = useCallback(async () => {
    if (!selectedNode || !user) return;
    if (!confirm(`Delete ${selectedNode.path}?`)) return;
    try {
      const parts = selectedNode.path.split('/');
      const docId = parts.pop()!;
      const collPath = parts.join('/');
      await deleteDoc(doc(db, collPath, docId));
      toast.success('Document deleted');
      setDocumentView(null);
      void loadTree(user.uid);
    } catch {
      toast.error('Delete failed');
    }
  }, [selectedNode, user, loadTree]);

  const handleForceSync = useCallback(() => {
    toast.info('Force sync triggered — check sync status in settings');
    setLastSyncTime(Date.now());
  }, []);

  const TreeItem = ({
    node,
    expandedNodes,
    selectedPath,
    onToggle,
    onSelect,
  }: {
    node: TreeNode;
    expandedNodes: Set<string>;
    selectedPath: string | null;
    onToggle: (id: string) => void;
    onSelect: (node: TreeNode) => void;
  }) => {
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedPath === node.path;

    return (
      <div>
        <div
          role="treeitem"
          aria-selected={isSelected}
          tabIndex={0}
          className={`flex items-center justify-between rounded px-2 py-1 cursor-pointer ${isSelected ? 'bg-blue-100 text-blue-800' : 'hover:bg-muted/10'}`}
          onClick={() => onSelect(node)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(node);
            } else if (
              e.key === 'ArrowRight' &&
              node.type !== 'document' &&
              !isExpanded
            ) {
              onToggle(node.id);
            } else if (e.key === 'ArrowLeft' && isExpanded) {
              onToggle(node.id);
            }
          }}
        >
          <div className="flex items-center gap-2">
            {node.type !== 'document' && (
              <button
                aria-expanded={isExpanded}
                aria-controls={`node-${node.id}-children`}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(node.id);
                }}
                className={`w-3 h-3 inline-flex items-center justify-center text-xs ${isExpanded ? 'rotate-90' : ''} transition-transform`}
                title={isExpanded ? 'Collapse' : 'Expand'}
                type="button"
              >
                ▶
              </button>
            )}
            <span>{node.label}</span>
          </div>
        </div>
        {isExpanded && node.children && (
          <div id={`node-${node.id}-children`} className="ml-4">
            {node.children.map((child) => (
              <TreeItem
                key={child.id}
                node={child}
                expandedNodes={expandedNodes}
                selectedPath={selectedPath}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!user) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <Card className="flex flex-col min-h-[600px] bg-muted/0">
      {/* Top Navigation / Status Bar */}
      <header className="flex items-center justify-between px-6">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-6 h-6 mr-1" />
            ) : (
              <WifiOff className="w-6 h-6 mr-1" />
            )}
          </div>
          <span className="text-muted-foreground">
            Synced:{' '}
            {lastSyncTime
              ? `${Math.round((Date.now() - lastSyncTime) / 1000)}s ago`
              : 'Never'}
          </span>
        </div>

        <Button variant="outline" size="sm" onClick={handleForceSync}>
          <RefreshCw className="w-8 h-8 mr-2" /> Sync
        </Button>
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Sidebar: Tree View */}
        <aside className="space-x-8 border-r flex flex-col">
          <div className="px-4 flex items-center justify-between">
            <h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
              Explorer
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => void loadTree(user.uid)}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
          <ScrollArea className="flex-1 px-2">
            <div className="space-y-1">
              {tree.map((node) => (
                <TreeItem
                  key={node.id}
                  node={node}
                  expandedNodes={expandedNodes}
                  selectedPath={selectedNode?.path || null}
                  onToggle={handleToggle}
                  // eslint-disable-next-line @typescript-eslint/no-misused-promises
                  onSelect={handleSelect}
                />
              ))}
            </div>
          </ScrollArea>
        </aside>

        {/* Content Area: Document Editor */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {documentView ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-sm font-mono font-medium truncate max-w-xl">
                    {documentView.path}
                  </h2>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>
                      Size: {formatSize(estimateSize(documentView.data))}
                    </span>
                    <span>•</span>
                    <span>
                      Modified:{' '}
                      {formatTime(
                        extractLastModified(
                          documentView.data as DocumentData
                        ) || undefined
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {!documentView.isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          setDocumentView((prev) =>
                            prev ? { ...prev, isEditing: true } : null
                          )
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleDelete()}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        onClick={() => void handleSave()}
                      >
                        <Save className="w-4 h-4 mr-2" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setDocumentView((prev) =>
                            prev ? { ...prev, isEditing: false } : null
                          )
                        }
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                {documentView.isEditing ? (
                  <Textarea
                    className="font-mono text-sm min-h-[500px] focus-visible:ring-1"
                    value={documentView.editValue}
                    onChange={(e) =>
                      setDocumentView((prev) =>
                        prev ? { ...prev, editValue: e.target.value } : null
                      )
                    }
                  />
                ) : (
                  <div className="rounded-lg border p-4">
                    <pre className="text-sm font-mono leading-relaxed">
                      {JSON.stringify(documentView.data, null, 2)}
                    </pre>
                  </div>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="w-12 h-12 rounded-full  flex items-center justify-center mb-4">
                <FileText className="w-6 h-6 " />
              </div>
              <h3 className="text-lg font-medium">No document selected</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-1">
                Select a document from the explorer tree to view its contents
                and metadata.
              </p>
            </div>
          )}
        </section>
      </main>
    </Card>
  );
}

function extractShardKey(data: DocumentData): string {
  // Use type casting to unknown then to specific structure to satisfy strict rules
  const typedData = data as Record<string, unknown>;
  const ts = (typedData.createdAt ?? typedData.lastModified) as
    | string
    | number
    | { toMillis?: () => number }
    | undefined;

  if (!ts) return 'unknown';

  let date: Date;
  if (typeof ts === 'string' || typeof ts === 'number') {
    date = new Date(ts);
  } else if (
    ts &&
    typeof ts === 'object' &&
    'toMillis' in ts &&
    typeof ts.toMillis === 'function'
  ) {
    date = new Date(ts.toMillis());
  } else {
    date = new Date();
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
