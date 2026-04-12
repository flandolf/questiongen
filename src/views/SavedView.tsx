import { useVirtualizer } from '@tanstack/react-virtual';
import {
  BarChart2,
  Bookmark,
  Clock3,
  FolderOpen,
  Hash,
  PlusCircle,
  RotateCcw,
  Search,
  SortAsc,
  Trash2,
} from 'lucide-react';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  FilterButton,
  FilterGroup,
  PageContainer,
  PageHeader,
  Toolbar,
} from '@/components/layout/primitives';

import { useSavedSets } from '../AppContext';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { ConfirmModal } from '../components/ui/ConfirmModal';
// import { ScrollArea } from "../components/ui/scroll-area";
import { formatDate } from '../lib/app-utils';
import type { SavedQuestionSet } from '../types';

type SortKey = 'updatedAt' | 'title' | 'progress';
type ModeFilter = 'all' | 'written' | 'mc';

function computeSavedSetSummary(savedSet: SavedQuestionSet) {
  const questionCount =
    savedSet.questionMode === 'written'
      ? (savedSet.writtenSession?.questions.length ?? 0)
      : (savedSet.mcSession?.questions.length ?? 0);
  const completedCount =
    savedSet.questionMode === 'written'
      ? Object.keys(savedSet.writtenSession?.feedbackByQuestionId ?? {}).length
      : Object.keys(savedSet.mcSession?.answersByQuestionId ?? {}).length;
  const progressPct =
    questionCount > 0 ? (completedCount / questionCount) * 100 : 0;
  const topics = savedSet.preferences.selectedTopics;
  const isWritten = savedSet.questionMode === 'written';
  const progressLabel =
    completedCount === 0
      ? 'Not started'
      : completedCount === questionCount
        ? 'Complete'
        : `${progressPct.toFixed(0)}% complete`;
  return {
    questionCount,
    completedCount,
    progressPct,
    topics,
    isWritten,
    progressLabel,
  };
}

const VirtualizedSavedSetList = memo(function VirtualizedSavedSetList({
  sets,
  onOpen,
  onDelete,
}: {
  sets: SavedQuestionSet[];
  onOpen: (id: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const setIdsKey = useMemo(() => sets.map((s) => s.id).join('|'), [sets]);
  const rowVirtualizer = useVirtualizer({
    count: sets.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => sets[index]?.id ?? index,
    estimateSize: () => 140,
    overscan: 4,
  });

  // Reset scroll to top when sets change (e.g. after delete)
  useEffect(() => {
    rowVirtualizer.scrollToIndex(0);
  }, [setIdsKey, rowVirtualizer]);

  // Re-measure in layout phase when item identities/order change.
  useLayoutEffect(() => {
    rowVirtualizer.measure();
    const rafId = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [setIdsKey, rowVirtualizer]);

  return (
    <div
      key={setIdsKey}
      ref={parentRef}
      className='flex-1 overflow-auto'
      style={{ minHeight: 0 }}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const savedSet = sets[virtualRow.index];
          if (!savedSet) return null;
          const {
            questionCount,
            completedCount,
            progressPct,
            topics,
            isWritten,
            progressLabel,
          } = computeSavedSetSummary(savedSet);
          return (
            <div
              key={savedSet.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
                paddingBottom: 16,
              }}
            >
              <Card className='overflow-hidden border shadow-sm transition-shadow hover:shadow-md bg-muted/30'>
                <CardHeader className='px-4 border-b'>
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='space-y-1 min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='text-base  truncate'>
                          {savedSet.title}
                        </span>
                        <Badge
                          variant='secondary'
                          className={`shrink-0 text-xs ${
                            isWritten
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                              : 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                          }`}
                        >
                          {isWritten ? 'Written' : 'Multiple Choice'}
                        </Badge>
                      </div>
                      <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                        <Clock3 className='h-3 w-3 shrink-0' />
                        Saved {formatDate(savedSet.updatedAt)}
                      </p>
                    </div>
                    <div className='flex items-center gap-2 shrink-0'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='gap-1.5 px-3 py-2 h-8 text-xs'
                        onClick={() => onOpen(savedSet.id)}
                      >
                        <FolderOpen className='h-3.5 w-3.5' />
                        Reopen
                      </Button>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        className='gap-1.5 px-3 py-2 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10'
                        onClick={() => onDelete(savedSet.id, savedSet.title)}
                      >
                        <Trash2 className='h-3.5 w-3.5' />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className='px-4 py-3 space-y-3'>
                  <div className='flex flex-wrap gap-1.5'>
                    {topics.length > 0 ? (
                      topics.map((topic: string) => (
                        <Badge
                          key={topic}
                          variant='outline'
                          className='text-xs px-2 py-0.5'
                        >
                          {topic}
                        </Badge>
                      ))
                    ) : (
                      <Badge variant='outline' className='text-xs px-2 py-0.5'>
                        Mixed topics
                      </Badge>
                    )}
                  </div>
                  <div className='grid grid-cols-3 gap-2'>
                    <div className='rounded-sm border bg-muted/20 px-3 py-2 space-y-1'>
                      <div className='flex items-center gap-1 text-muted-foreground'>
                        <BarChart2 className='h-3 w-3 shrink-0' />
                        <span className='text-xs  uppercase tracking-wide'>
                          Difficulty
                        </span>
                      </div>
                      <div className='text-xs  capitalize'>
                        {savedSet.preferences.difficulty}
                      </div>
                    </div>
                    <div className='rounded-sm border bg-muted/20 px-3 py-2 space-y-1'>
                      <div className='flex items-center gap-1 text-muted-foreground'>
                        <Hash className='h-3 w-3 shrink-0' />
                        <span className='text-xs  uppercase tracking-wide'>
                          Progress
                        </span>
                      </div>
                      <div className='text-xs font-medium'>
                        {completedCount}/{questionCount}
                      </div>
                    </div>
                    <div className='rounded-sm border bg-muted/20 px-3 py-2 space-y-1'>
                      <div className='flex items-center gap-1 text-muted-foreground'>
                        <Clock3 className='h-3 w-3 shrink-0' />
                        <span className='text-xs font-semibold uppercase tracking-wide'>
                          Saved
                        </span>
                      </div>
                      <div className='text-xs font-medium truncate'>
                        {formatDate(savedSet.updatedAt)}
                      </div>
                    </div>
                  </div>
                  <div className='space-y-1'>
                    <div className='h-1.5 w-full rounded-sm bg-muted overflow-hidden'>
                      <div
                        className={`h-full rounded-sm transition-all duration-500 ${isWritten ? 'bg-sky-500' : 'bg-violet-500'}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p
                      className={`text-xs text-right font-medium ${
                        completedCount === 0
                          ? 'text-muted-foreground/60 italic'
                          : completedCount === questionCount
                            ? isWritten
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-violet-600 dark:text-violet-400'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {progressLabel}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
});

export function SavedView() {
  const navigate = useNavigate();
  const {
    savedSets,
    loadSavedSet,
    deleteSavedSet,
    deleteAllSavedSets,
    needsSaveBeforeLoad,
    saveCurrentSet,
  } = useSavedSets();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);

  // --- #1: Sort + filter state ---
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all');
  const [search, setSearch] = useState('');

  function handleOpen(savedSetId: string) {
    if (needsSaveBeforeLoad(savedSetId)) {
      setPendingLoadId(savedSetId);
      setLoadConfirmOpen(true);
      return;
    }
    loadSavedSet(savedSetId);
    void navigate('/');
  }

  function performLoadConfirmed() {
    if (!pendingLoadId) return;
    try {
      saveCurrentSet();
    } catch {
      /* ignore */
    }
    loadSavedSet(pendingLoadId);
    setPendingLoadId(null);
    setLoadConfirmOpen(false);
    void navigate('/');
    toast.success('Session loaded');
  }

  function handleDelete(savedSetId: string, title: string) {
    setPendingDelete({ id: savedSetId, title });
    setConfirmOpen(true);
  }

  function performDeleteConfirmed() {
    if (!pendingDelete) return;
    deleteSavedSet(pendingDelete.id);
    setPendingDelete(null);
    setConfirmOpen(false);
    toast.success('Saved set deleted');
  }

  // --- #1: Filtered + sorted sets ---
  const filteredSets = useMemo(() => {
    let result = [...savedSets];

    // Mode filter
    if (modeFilter !== 'all') {
      result = result.filter((s) =>
        modeFilter === 'written'
          ? s.questionMode === 'written'
          : s.questionMode !== 'written',
      );
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.preferences.selectedTopics.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortKey === 'updatedAt')
        return String(b.updatedAt || '').localeCompare(
          String(a.updatedAt || ''),
        );
      if (sortKey === 'title') return a.title.localeCompare(b.title);
      if (sortKey === 'progress') {
        const progressOf = (s: typeof a) => {
          const total =
            s.questionMode === 'written'
              ? (s.writtenSession?.questions.length ?? 0)
              : (s.mcSession?.questions.length ?? 0);
          const done =
            s.questionMode === 'written'
              ? Object.keys(s.writtenSession?.feedbackByQuestionId ?? {}).length
              : Object.keys(s.mcSession?.answersByQuestionId ?? {}).length;
          return total > 0 ? done / total : 0;
        };
        return progressOf(b) - progressOf(a);
      }
      return 0;
    });

    return result;
  }, [savedSets, modeFilter, search, sortKey]);

  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);

  function handleDeleteAll() {
    setConfirmDeleteAllOpen(true);
  }

  function performDeleteAllConfirmed() {
    deleteAllSavedSets();
    setConfirmDeleteAllOpen(false);
    toast.success('All saved sets cleared');
  }

  // Find the pending-load set's title for contextual confirm copy (#14)
  const pendingLoadSet = savedSets.find((s) => s.id === pendingLoadId);

  if (savedSets.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          title='No Saved Sets Yet.'
          description='Save a generated question set from the generator to reopen it later.'
          icon={Bookmark}
          actions={
            <Button onClick={() => void navigate('/')}>
              <PlusCircle className='h-4 w-4' />
              Generate your first set
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title='Saved Sets'
        description='Reopen saved written and multiple-choice sets with your progress intact.'
      />

      <Toolbar>
        <div className='relative flex-1 min-w-[160px] max-w-xs'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none' />
          <input
            type='text'
            placeholder='Search sets…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-full h-8 pl-8 pr-3 text-xs rounded-sm border bg-background focus:outline-none focus:ring-2 focus:ring-ring'
          />
        </div>

        <FilterGroup>
          {(['all', 'written', 'mc'] as ModeFilter[]).map((mode) => (
            <FilterButton
              key={mode}
              active={modeFilter === mode}
              onClick={() => setModeFilter(mode)}
            >
              {mode === 'all' ? 'All' : mode === 'written' ? 'Written' : 'MC'}
            </FilterButton>
          ))}
        </FilterGroup>

        <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          <SortAsc className='h-3.5 w-3.5 shrink-0' />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className='h-8 px-2 text-xs rounded-sm border bg-background focus:outline-none focus:ring-2 focus:ring-ring'
          >
            <option value='updatedAt'>Last saved</option>
            <option value='title'>Title A–Z</option>
            <option value='progress'>Progress</option>
          </select>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={handleDeleteAll}
          className='h-8 gap-1.5 text-xs'
        >
          <RotateCcw className='h-3.5 w-3.5' />
          Clear all
        </Button>
      </Toolbar>

      {filteredSets.length === 0 && (
        <p className='text-sm text-muted-foreground px-1'>
          No sets match your filters.
        </p>
      )}

      <div className='flex-1'>
        <VirtualizedSavedSetList
          sets={filteredSets}
          onOpen={handleOpen}
          onDelete={handleDelete}
        />
      </div>

      <ConfirmModal
        open={confirmOpen}
        title='Delete saved set'
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently deleted. Your history entries will be kept.`
            : undefined
        }
        confirmText='Delete'
        cancelText='Cancel'
        onConfirm={performDeleteConfirmed}
        onCancel={() => {
          setConfirmOpen(false);
          setPendingDelete(null);
        }}
      />

      <ConfirmModal
        open={confirmDeleteAllOpen}
        title='Clear all saved sets'
        description='All saved sets will be permanently deleted. Your history entries will be kept.'
        confirmText='Clear all'
        cancelText='Cancel'
        onConfirm={performDeleteAllConfirmed}
        onCancel={() => setConfirmDeleteAllOpen(false)}
      />

      {/* --- #4 + #14: Reframed load confirm with set title --- */}
      <ConfirmModal
        open={loadConfirmOpen}
        title='Load saved set'
        description={
          pendingLoadSet
            ? `Your current session will be saved automatically before opening "${pendingLoadSet.title}".`
            : 'Your current session will be saved automatically before loading.'
        }
        confirmText='Continue'
        cancelText='Cancel'
        onConfirm={performLoadConfirmed}
        onCancel={() => {
          setLoadConfirmOpen(false);
          setPendingLoadId(null);
        }}
      />
    </PageContainer>
  );
}
