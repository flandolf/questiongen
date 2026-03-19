import { Bookmark, BookOpen, Clock3, FolderOpen, Trash2, Target, BarChart2, Hash } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSavedSets } from "../AppContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { confirmAction, formatDate } from "../lib/app-utils";
import { EmptyState } from "../components/EmptyState";

export function SavedView() {
  const navigate = useNavigate();
  const { savedSets, loadSavedSet, deleteSavedSet } = useSavedSets();

  function handleOpen(savedSetId: string) {
    loadSavedSet(savedSetId);
    navigate("/");
  }

  function handleDelete(savedSetId: string, title: string) {
    if (!confirmAction(`Delete saved set \"${title}\"? This will not remove history entries.`)) {
      return;
    }
    deleteSavedSet(savedSetId);
  }

  if (savedSets.length === 0) {
    return (
      <EmptyState
        title="No Saved Sets Yet"
        description="Save a generated question set from the generator to reopen it later."
        icon={Bookmark}
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

      <ScrollArea className="flex-1">
        <div className="space-y-3 pb-8">
          {savedSets.map((savedSet) => {
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

                  {/* Stats row */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border bg-muted/20 px-3 py-2 space-y-1">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        {isWritten
                          ? <BookOpen className="h-3 w-3 shrink-0" />
                          : <Target className="h-3 w-3 shrink-0" />}
                        <span className="text-xs font-semibold uppercase tracking-wide">Mode</span>
                      </div>
                      <div className="text-xs font-medium truncate">
                        {isWritten ? "Written" : "Multiple Choice"}
                      </div>
                    </div>

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
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${isWritten ? "bg-sky-500" : "bg-violet-500"}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground text-right">{progressPct.toFixed(0)}% complete</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}