import { Bookmark, BookOpen, Clock3, FolderOpen, Trash2, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSavedSets } from "../AppContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
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
    <div className="min-w-full p-4.5 h-full flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Saved Sets</h1>
        <p className="text-muted-foreground mt-2">Reopen saved written and multiple-choice sets with your progress intact.</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 pb-8">
          {savedSets.map((savedSet) => {
            const isPassageSet = savedSet.questionMode === "written" && Boolean(savedSet.passageSession?.passage);
            const questionCount = savedSet.questionMode === "written"
              ? (isPassageSet ? savedSet.passageSession?.passage?.questions.length ?? 0 : savedSet.writtenSession?.questions.length ?? 0)
              : savedSet.mcSession?.questions.length ?? 0;
            const completedCount = savedSet.questionMode === "written"
              ? Object.keys((isPassageSet ? savedSet.passageSession?.feedbackByQuestionId : savedSet.writtenSession?.feedbackByQuestionId) ?? {}).length
              : Object.keys(savedSet.mcSession?.answersByQuestionId ?? {}).length;
            const topics = savedSet.preferences.selectedTopics;
            const modeLabel = savedSet.questionMode === "written"
              ? (isPassageSet ? "Written (Text Analysis)" : "Written")
              : "Multiple Choice";
            const modeDisplay = savedSet.questionMode === "written"
              ? (isPassageSet ? "Text Analysis" : "Written Response")
              : "Multiple Choice";

            return (
              <Card key={savedSet.id}>
                <CardHeader className="gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{savedSet.title}</CardTitle>
                        <Badge variant="secondary">
                          {modeLabel}
                        </Badge>
                      </div>
                      <CardDescription className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                        <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> Saved {formatDate(savedSet.updatedAt)}</span>
                        <span>{completedCount}/{questionCount} completed</span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => handleOpen(savedSet.id)}>
                        <FolderOpen className="h-4 w-4" />
                        Reopen
                      </Button>
                      <Button type="button" variant="destructive" size="sm" className="gap-2" onClick={() => handleDelete(savedSet.id, savedSet.title)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {topics.length > 0 ? topics.map((topic) => (
                      <Badge key={topic} variant="outline">{topic}</Badge>
                    )) : (
                      <Badge variant="outline">Mixed topics</Badge>
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                        {savedSet.questionMode === "written" ? <BookOpen className="h-4 w-4 text-primary" /> : <Target className="h-4 w-4 text-primary" />}
                        {modeDisplay}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Difficulty</div>
                      <div className="mt-2 text-sm font-medium">{savedSet.preferences.difficulty}</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Questions</div>
                      <div className="mt-2 text-sm font-medium">{questionCount} total</div>
                    </div>
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
