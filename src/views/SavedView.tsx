import { Bookmark, BookOpen, Clock3, FolderOpen, Trash2, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppContext } from "../AppContext";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { ScrollArea } from "../components/ui/scroll-area";
import { formatDate } from "../lib/app-utils";

export function SavedView() {
  const navigate = useNavigate();
  const { savedSets, loadSavedSet, deleteSavedSet } = useAppContext();

  function handleOpen(savedSetId: string) {
    loadSavedSet(savedSetId);
    navigate("/");
  }

  function handleDelete(savedSetId: string, title: string) {
    if (!window.confirm(`Delete saved set \"${title}\"? This will not remove history entries.`)) {
      return;
    }
    deleteSavedSet(savedSetId);
  }

  if (savedSets.length === 0) {
    return (
      <div className="p-3 sm:p-4 lg:p-5 h-full flex flex-col items-center justify-center text-center gap-3">
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          <Bookmark className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">No Saved Sets Yet</h2>
          <p className="text-muted-foreground">Save a generated question set from the generator to reopen it later.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-5 max-w-5xl mx-auto h-full flex flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Saved Sets</h1>
        <p className="text-muted-foreground mt-2">Reopen saved written and multiple-choice sets with your progress intact.</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 pb-8">
          {savedSets.map((savedSet) => {
            const questionCount = savedSet.questionMode === "written"
              ? savedSet.writtenSession?.questions.length ?? 0
              : savedSet.mcSession?.questions.length ?? 0;
            const completedCount = savedSet.questionMode === "written"
              ? Object.keys(savedSet.writtenSession?.feedbackByQuestionId ?? {}).length
              : Object.keys(savedSet.mcSession?.answersByQuestionId ?? {}).length;
            const topics = savedSet.preferences.selectedTopics;

            return (
              <Card key={savedSet.id}>
                <CardHeader className="gap-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{savedSet.title}</CardTitle>
                        <Badge variant="secondary">
                          {savedSet.questionMode === "written" ? "Written" : "Multiple Choice"}
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
                        {savedSet.questionMode === "written" ? "Written Response" : "Multiple Choice"}
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
