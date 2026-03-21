import { Bookmark, BookOpen, Clock3, FolderOpen, Trash2, Target, BarChart2, Hash, SortAsc, Filter, Search, PlusCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSavedSets } from "../AppContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { formatDate } from "../lib/app-utils";
import { EmptyState } from "../components/EmptyState";
import { ConfirmModal } from "../components/ui/ConfirmModal";
import { useState, useMemo } from "react";

type SortKey = "updatedAt" | "title" | "progress";
type ModeFilter = "all" | "written" | "mc";

export function SavedView() {
  const navigate = useNavigate();
  const { savedSets, loadSavedSet, deleteSavedSet, needsSaveBeforeLoad, saveCurrentSet } = useSavedSets();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [loadConfirmOpen, setLoadConfirmOpen] = useState(false);
  const [pendingLoadId, setPendingLoadId] = useState<string | null>(null);

  // --- #1: Sort + filter state ---
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [modeFilter, setModeFilter] = useState<ModeFilter>("all");
  const [search, setSearch] = useState("");

  function handleOpen(savedSetId: string) {
    if (needsSaveBeforeLoad(savedSetId)) {
      setPendingLoadId(savedSetId);
      setLoadConfirmOpen(true);
      return;
    }
    loadSavedSet(savedSetId);
    navigate("/");
  }

  function performLoadConfirmed() {
    if (!pendingLoadId) return;
    try { saveCurrentSet(); } catch { /* ignore */ }
    loadSavedSet(pendingLoadId);
    setPendingLoadId(null);
    setLoadConfirmOpen(false);
    navigate("/");
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
  }

  // --- #1: Filtered + sorted sets ---
  const filteredSets = useMemo(() => {
    let result = [...savedSets];

    // Mode filter
    if (modeFilter !== "all") {
      result = result.filter((s) =>
        modeFilter === "written" ? s.questionMode === "written" : s.questionMode !== "written"
      );
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.preferences.selectedTopics.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortKey === "updatedAt") return b.updatedAt.localeCompare(a.updatedAt);
      if (sortKey === "title") return a.title.localeCompare(b.title);
      if (sortKey === "progress") {
        const progressOf = (s: typeof a) => {
          const total =
            s.questionMode === "written"
              ? s.writtenSession?.questions.length ?? 0
              : s.mcSession?.questions.length ?? 0;
          const done =
            s.questionMode === "written"
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

  // Find the pending-load set's title for contextual confirm copy (#14)
  const pendingLoadSet = savedSets.find((s) => s.id === pendingLoadId);

  if (savedSets.length === 0) {
    return (
      <EmptyState
        title="No Saved Sets Yet"
        description="Save a generated question set from the generator to reopen it later."
        icon={Bookmark}
        // --- #13: CTA to generator ---
        action={
          <Button variant="default" size="sm" className="gap-2 mt-2" onClick={() => navigate("/")}>
            <PlusCircle className="h-4 w-4" />
            Generate your first set
          </Button>
        }
      />
    );
  }

  return (
    <div className="min-w-full px-4 py-4 h-full flex flex-col gap-4">
      {/* Page header */}
      <div className="px-1">
        <h1 className="text-3xl font-bold tracking-tight">Saved Sets</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Reopen saved written and multiple-choice sets with your progress intact.
        </p>
      </div>

      {/* --- #1: Search + filter + sort toolbar --- */}
      <div className="flex flex-wrap gap-2 items-center px-1">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search sets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Mode filter */}
        <div className="flex items-center gap-1 rounded-md border bg-muted/30 p-0.5">
          {(["all", "written", "mc"] as ModeFilter[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setModeFilter(mode)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                modeFilter === mode
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {mode === "all" ? "All" : mode === "written" ? "Written" : "MC"}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <SortAsc className="h-3.5 w-3.5 shrink-0" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 px-2 text-xs rounded-md border bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="updatedAt">Last saved</option>
            <option value="title">Title A–Z</option>
            <option value="progress">Progress</option>
          </select>
        </div>
      </div>

      {filteredSets.length === 0 && (
        <p className="text-sm text-muted-foreground px-1">No sets match your filters.</p>
      )}

      <ScrollArea className="flex-1">
        <div className="space-y-3 pb-8">
          {filteredSets.map((savedSet) => {
            const questionCount =
              savedSet.questionMode === "written"
                ? savedSet.writtenSession?.questions.length ?? 0
                : savedSet.mcSession?.questions.length ?? 0;
            const completedCount =
              savedSet.questionMode === "written"
                ? Object.keys(savedSet.writtenSession?.feedbackByQuestionId ?? {}).length
                : Object.keys(savedSet.mcSession?.answersByQuestionId ?? {}).length;
            const progressPct = questionCount > 0 ? (completedCount / questionCount) * 100 : 0;
            const topics = savedSet.preferences.selectedTopics;
            const isWritten = savedSet.questionMode === "written";

            // --- #3: zero-state label ---
            const progressLabel =
              completedCount === 0
                ? "Not started"
                : completedCount === questionCount
                ? "Complete"
                : `${progressPct.toFixed(0)}% complete`;

            return (
              <Card key={savedSet.id} className="overflow-hidden border shadow-sm transition-shadow hover:shadow-md">
                <CardHeader className="px-4 border-b">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Title + meta */}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold truncate">{savedSet.title}</span>
                        <Badge
                          variant="secondary"
                          className={`shrink-0 text-xs ${isWritten
                              ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                            }`}
                        >
                          {isWritten ? "Written" : "Multiple Choice"}
                        </Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock3 className="h-3 w-3 shrink-0" />
                        Saved {formatDate(savedSet.updatedAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5 px-3 py-2 h-8 text-xs"
                        onClick={() => handleOpen(savedSet.id)}
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                        Reopen
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 px-3 py-2 h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(savedSet.id, savedSet.title)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="px-4 py-3 space-y-3">
                  {/* Topics */}
                  <div className="flex flex-wrap gap-1.5">
                    {topics.length > 0
                      ? topics.map((topic) => (
                        <Badge key={topic} variant="outline" className="text-xs px-2 py-0.5">
                          {topic}
                        </Badge>
                      ))
                      : <Badge variant="outline" className="text-xs px-2 py-0.5">Mixed topics</Badge>}
                  </div>

                  {/* --- #2: Stats row — replaced redundant Mode card with Last opened --- */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <BarChart2 className="h-3 w-3 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Difficulty</span>
                      </div>
                      <div className="text-xs font-medium capitalize">{savedSet.preferences.difficulty}</div>
                    </div>

                    <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Hash className="h-3 w-3 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Progress</span>
                      </div>
                      <div className="text-xs font-medium">{completedCount}/{questionCount}</div>
                    </div>

                    {/* --- #2: Last opened replacing the duplicate Mode card --- */}
                    <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Clock3 className="h-3 w-3 shrink-0" />
                        <span className="text-xs font-semibold uppercase tracking-wide">Saved</span>
                      </div>
                      <div className="text-xs font-medium truncate">{formatDate(savedSet.updatedAt)}</div>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isWritten ? "bg-sky-500" : "bg-violet-500"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    {/* --- #3: Progress label with zero/complete state --- */}
                    <p className={`text-xs text-right font-medium ${
                      completedCount === 0
                        ? "text-muted-foreground/60 italic"
                        : completedCount === questionCount
                        ? isWritten ? "text-sky-600 dark:text-sky-400" : "text-violet-600 dark:text-violet-400"
                        : "text-muted-foreground"
                    }`}>
                      {progressLabel}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      <ConfirmModal
        open={confirmOpen}
        title="Delete saved set"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be permanently deleted. Your history entries will be kept.`
            : undefined
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={performDeleteConfirmed}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null); }}
      />

      {/* --- #4 + #14: Reframed load confirm with set title --- */}
      <ConfirmModal
        open={loadConfirmOpen}
        title="Load saved set"
        description={
          pendingLoadSet
            ? `Your current session will be saved automatically before opening "${pendingLoadSet.title}".`
            : "Your current session will be saved automatically before loading."
        }
        confirmText="Continue"
        cancelText="Cancel"
        onConfirm={performLoadConfirmed}
        onCancel={() => { setLoadConfirmOpen(false); setPendingLoadId(null); }}
      />
    </div>
  );
}
