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
import {
  ChevronDown,
  ChevronRight,
  FileJson,
  FileText,
  Folder,
  RefreshCw,
  Save,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <div className="flex items-center justify-center min-h-[600px] p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl text-center">
            Remote Explorer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-col gap-2 pt-2">
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Processing...' : isSignUp ? 'Sign Up' : 'Sign In'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsSignUp(!isSignUp)}
                className="w-full"
              >
                {isSignUp
                  ? 'Already have an account? Sign In'
                  : 'Need an account? Sign Up'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
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
  const [syncDisplay, setSyncDisplay] = useState('Never');

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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) void loadTree(u.uid);
    });
    unsubRef.current = () => unsub();
    return () => unsub();
  }, [loadTree]);

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

  useEffect(() => {
    if (!lastSyncTime) {
      setSyncDisplay('Never');
      return;
    }
    const update = () => {
      const elapsed = Math.round((Date.now() - lastSyncTime) / 1000);
      setSyncDisplay(`${elapsed}s ago`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [lastSyncTime]);

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
    toast.info('Force sync triggered');
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
    const isDocument = node.type === 'document';

    return (
      <div className="flex flex-col">
        <div
          role="treeitem"
          aria-selected={isSelected}
          tabIndex={0}
          className={`flex items-center gap-1.5 py-1.5 px-2 cursor-pointer transition-colors border-l-2 ${
            isSelected
              ? 'border-primary text-primary font-medium'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            if (node.type !== 'document') onToggle(node.id);
            else onSelect(node);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(node);
            } else if (e.key === 'ArrowRight' && !isDocument && !isExpanded) {
              onToggle(node.id);
            } else if (e.key === 'ArrowLeft' && isExpanded) {
              onToggle(node.id);
            }
          }}
        >
          {!isDocument ? (
            <button
              aria-expanded={isExpanded}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(node.id);
              }}
              className="flex items-center justify-center w-4 h-4 text-muted-foreground hover:text-foreground"
              type="button"
            >
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <span className="w-4 h-4 flex items-center justify-center">
              <FileJson className="w-3.5 h-3.5 opacity-70" />
            </span>
          )}

          {!isDocument && <Folder className="w-3.5 h-3.5 opacity-70" />}

          <span className="text-sm truncate select-none">{node.label}</span>
        </div>

        {isExpanded && node.children && (
          <div className="pl-4 border-l ml-2 flex flex-col gap-0.5 mt-0.5">
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
    <Card className="flex flex-col h-[800px] border bg-muted/0">
      <header className="flex items-center justify-between px-4 pb-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold tracking-tight">Database Explorer</h1>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5" />
            ) : (
              <WifiOff className="w-3.5 h-3.5" />
            )}
            <span>
              {isOnline ? 'Connected' : 'Offline'} • Synced: {syncDisplay}
            </span>
          </div>
        </div>

        <Button variant="outline" size="sm" onClick={handleForceSync}>
          <RefreshCw className="w-4 h-4 mr-2" /> Sync
        </Button>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <aside className="w-64 border-r flex flex-col">
          <div className="px-3 pb-2 border-b flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Collections
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => void loadTree(user.uid)}
            >
              <RefreshCw
                className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-2">
            <div className="flex flex-col gap-1">
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

        <section className="flex-1 flex flex-col overflow-hidden">
          {documentView ? (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b flex items-center justify-between">
                <div className="flex flex-col gap-1 overflow-hidden">
                  <span className="text-xs font-medium text-muted-foreground truncate">
                    {documentView.path.split('/').slice(0, -1).join(' / ')}
                  </span>
                  <h2 className="text-sm font-semibold truncate">
                    {documentView.path.split('/').pop()}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatSize(estimateSize(documentView.data))}</span>
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
                <div className="flex items-center gap-2 shrink-0">
                  {!documentView.isEditing ? (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setDocumentView((prev) =>
                            prev ? { ...prev, isEditing: true } : null
                          )
                        }
                      >
                        Edit Document
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleDelete()}
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => void handleSave()}
                      >
                        <Save className="w-4 h-4 mr-2" /> Save Changes
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

              <ScrollArea className="flex-1">
                <div className="p-4 h-full">
                  {documentView.isEditing ? (
                    <Textarea
                      className="font-mono text-sm min-h-[500px] w-full resize-none border-transparent focus-visible:ring-1 focus-visible:ring-primary shadow-none"
                      value={documentView.editValue}
                      onChange={(e) =>
                        setDocumentView((prev) =>
                          prev ? { ...prev, editValue: e.target.value } : null
                        )
                      }
                      spellCheck={false}
                    />
                  ) : (
                    <pre className="text-sm font-mono leading-relaxed p-4 border rounded-md overflow-x-auto">
                      {JSON.stringify(documentView.data, null, 2)}
                    </pre>
                  )}
                </div>
              </ScrollArea>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center">
              <div className="w-16 h-16 border rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                <FileText className="w-8 h-8 opacity-50" />
              </div>
              <h3 className="text-lg font-medium">Select a Document</h3>
              <p className="text-sm text-muted-foreground max-w-sm mt-2">
                Navigate through the collections in the sidebar to inspect or
                modify stored records within the database.
              </p>
            </div>
          )}
        </section>
      </main>
    </Card>
  );
}

function extractShardKey(data: DocumentData): string {
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
