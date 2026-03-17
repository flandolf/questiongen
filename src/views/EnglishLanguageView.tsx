import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft, ArrowRight, Book, BookText, Loader2, RefreshCcw, Target, ListChecks, CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import {
    useAppContext,
    useAppPreferences,
    useAppSettings,
    usePassageSession,
} from "../AppContext";
import { MarkdownMath } from "../components/MarkdownMath";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { ScrollArea } from "../components/ui/scroll-area";
import { Separator } from "../components/ui/separator";
import { Slider } from "../components/ui/slider";
import { Textarea } from "../components/ui/textarea";
import {
    ENGLISH_LANGUAGE_SUBTOPICS,
    GeneratePassageResponse,
    MarkAnswerResponse,
} from "../types";
import { formatDurationMs, readBackendError } from "../lib/app-utils";

function renderScoreVariant(achievedMarks: number, maxMarks: number) {
    if (achievedMarks >= maxMarks) {
        return "default" as const;
    }
    if (achievedMarks > 0) {
        return "secondary" as const;
    }
    return "destructive" as const;
}

export function EnglishLanguageView() {
    const [showRawOutput, setShowRawOutput] = useState(false);
    const {
        apiKey,
        model,
        debugMode,
        useStructuredOutput,
    } = useAppSettings();
    const {
        passageAosSubtopic,
        setPassageAosSubtopic,
        passageQuestionCount,
        setPassageQuestionCount,
    } = useAppPreferences();
    const {
        passage,
        setPassage,
        activePassageQuestionIndex,
        setActivePassageQuestionIndex,
        setPassageQuestionPresentedAtById,
        passageAnswersByQuestionId,
        setPassageAnswersByQuestionId,
        passageFeedbackByQuestionId,
        setPassageFeedbackByQuestionId,
        passageRawModelOutput,
        setPassageRawModelOutput,
        passageGenerationTelemetry,
        setPassageGenerationTelemetry,
    } = usePassageSession();
    const {
        isGenerating,
        setIsGenerating,
        generationStatus,
        setGenerationStatus,
        generationStartedAt,
        setGenerationStartedAt,
        isMarking,
        setIsMarking,
        errorMessage,
        setErrorMessage,
    } = useAppContext();

    const activeQuestion = passage?.questions[activePassageQuestionIndex] ?? null;
    const activeAnswer = activeQuestion ? (passageAnswersByQuestionId[activeQuestion.id] ?? "") : "";
    const activeFeedback = activeQuestion ? passageFeedbackByQuestionId[activeQuestion.id] : undefined;
    const showSetup = !passage;
    const activeLineItems = useMemo(
        () =>
            (passage?.text ?? "")
                .split("\n")
                .filter((line) => line.trim().length > 0)
                .map((line, index) => ({ lineNumber: index + 1, text: line })),
        [passage],
    );
    const passageQuestionsComplete = useMemo(
        () => (passage ? passage.questions.every((question) => Boolean(passageFeedbackByQuestionId[question.id])) : false),
        [passage, passageFeedbackByQuestionId],
    );
    const canGenerate =
        apiKey.trim().length > 0 &&
        model.trim().length > 0 &&
        passageQuestionCount >= 3 &&
        passageQuestionCount <= 10 &&
        !isGenerating;
    const canSubmit =
        Boolean(activeQuestion) &&
        activeAnswer.trim().length > 0 &&
        apiKey.trim().length > 0 &&
        model.trim().length > 0 &&
        !isMarking;

    useEffect(() => {
        if (!activeQuestion) {
            return;
        }

        setPassageQuestionPresentedAtById((prev) => {
            if (prev[activeQuestion.id]) {
                return prev;
            }
            return {
                ...prev,
                [activeQuestion.id]: Date.now(),
            };
        });
    }, [activeQuestion, setPassageQuestionPresentedAtById]);

    async function handleGeneratePassage() {
        if (!canGenerate) {
            return;
        }

        try {
            setErrorMessage(null);
            setIsGenerating(true);
            setGenerationStatus(null);
            setGenerationStartedAt(Date.now());

            const response = await invoke<GeneratePassageResponse>("generate_passage_questions", {
                request: {
                    aosSubtopic: passageAosSubtopic,
                    questionCount: passageQuestionCount,
                    model,
                    apiKey,
                    useStructuredOutput,
                },
            });

            setPassage(response.passage);
            setActivePassageQuestionIndex(0);
            setPassageAnswersByQuestionId({});
            setPassageFeedbackByQuestionId({});
            setPassageQuestionPresentedAtById({});
            setPassageRawModelOutput(response.rawModelOutput ?? "");
            setPassageGenerationTelemetry(response.telemetry ?? null);
            setShowRawOutput(false);
        } catch (error) {
            setErrorMessage(readBackendError(error));
        } finally {
            setIsGenerating(false);
            setGenerationStartedAt(null);
        }
    }

    async function handleSubmitAnswer() {
        if (!activeQuestion || !passage || !canSubmit) {
            return;
        }

        try {
            setErrorMessage(null);
            setIsMarking(true);
            const response = await invoke<MarkAnswerResponse>("mark_passage_answer", {
                request: {
                    passageText: passage.text,
                    aosSubtopic: passage.aosSubtopic,
                    question: activeQuestion,
                    studentAnswer: activeAnswer,
                    model,
                    apiKey,
                },
            });

            setPassageFeedbackByQuestionId((prev) => ({
                ...prev,
                [activeQuestion.id]: response,
            }));
        } catch (error) {
            setErrorMessage(readBackendError(error));
        } finally {
            setIsMarking(false);
        }
    }

    function handleResetPassage() {
        setErrorMessage(null);
        setPassage(null);
        setActivePassageQuestionIndex(0);
        setPassageAnswersByQuestionId({});
        setPassageFeedbackByQuestionId({});
        setPassageQuestionPresentedAtById({});
        setPassageRawModelOutput("");
        setPassageGenerationTelemetry(null);
        setGenerationStatus(null);
        setGenerationStartedAt(null);
        setShowRawOutput(false);
    }

    return (
        <div className="space-y-6 p-3.5 pb-8">
            <div className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight">English Language</h1>
                <p className="max-w-3xl text-sm text-muted-foreground">
                    Generate a stimulus passage with fixed line numbers and move through short-answer analysis questions without losing the passage context.
                </p>
            </div>

            {errorMessage ? (
                <Card className="border-destructive/40 bg-destructive/5">
                    <CardContent className="pt-6 text-sm text-destructive">{errorMessage}</CardContent>
                </Card>
            ) : null}

            {showSetup ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BookText className="h-5 w-5" />
                            Passage Setup
                        </CardTitle>
                        <CardDescription>
                            Choose an Area of Study and the number of sub-questions to generate from one shared passage.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-3">
                            <Label>Area of Study</Label>
                            <div className="flex flex-wrap gap-2">
                                {ENGLISH_LANGUAGE_SUBTOPICS.map((subtopic) => {
                                    const active = passageAosSubtopic === subtopic;
                                    return (
                                        <button
                                            key={subtopic}
                                            type="button"
                                            onClick={() => setPassageAosSubtopic(subtopic)}
                                            className={[
                                                "rounded-full border px-4 py-2 text-left text-sm font-medium transition-all duration-200",
                                                active
                                                    ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                                                    : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:bg-muted/50 hover:text-foreground",
                                            ].join(" ")}
                                        >
                                            {subtopic}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <Label>Question Count</Label>
                                <Badge variant="secondary">{passageQuestionCount} questions</Badge>
                            </div>
                            <Slider
                                min={3}
                                max={10}
                                step={1}
                                value={[passageQuestionCount]}
                                onValueChange={(value) => setPassageQuestionCount(value[0] ?? 5)}
                            />
                        </div>

                        {generationStatus?.mode === "passage" ? (
                            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                                <div className="flex items-center gap-2 font-medium text-foreground">
                                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                                    {generationStatus.message}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-3 text-xs">
                                    <span>Stage: {generationStatus.stage}</span>
                                    <span>Attempt: {generationStatus.attempt}</span>
                                    {generationStartedAt ? <span>Elapsed: {formatDurationMs(Date.now() - generationStartedAt)}</span> : null}
                                </div>
                            </div>
                        ) : null}

                        <div className="flex items-center gap-3">
                            <Button onClick={handleGeneratePassage} disabled={!canGenerate}>
                                {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Generate Passage
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            ) : passage && activeQuestion ? (
                <div className="space-y-6">
                    <div className="sticky top-2 z-10 rounded-2xl border border-border/50 bg-background/80 px-4 py-3 shadow-md backdrop-blur-md transition-all">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge>{passage.aosSubtopic}</Badge>
                                <Badge variant="secondary">
                                    Question {activePassageQuestionIndex + 1} of {passage.questions.length}
                                </Badge>
                                {passageQuestionsComplete ? <Badge variant="default">Complete</Badge> : null}
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setActivePassageQuestionIndex(Math.max(0, activePassageQuestionIndex - 1))}
                                    disabled={activePassageQuestionIndex === 0}
                                >
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Prev
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setActivePassageQuestionIndex(Math.min(passage.questions.length - 1, activePassageQuestionIndex + 1))}
                                    disabled={activePassageQuestionIndex >= passage.questions.length - 1}
                                >
                                    Next
                                    <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={handleResetPassage}>
                                    <RefreshCcw className="mr-2 h-4 w-4" />
                                    New Passage
                                </Button>
                            </div>
                        </div>
                    </div>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-row items-center space-x-1.5">
                                <Book className="mb-1 h-4 w-4" />
                                <CardTitle>Passage</CardTitle>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <ScrollArea className="w-full rounded-xl border border-border/70 bg-muted/10">
                                <div className="flex flex-col py-4 font-medium leading-[1.8] text-foreground">
                                    {activeLineItems.map((line) => (
                                        <div key={line.lineNumber} className="group flex flex-row px-4 transition-colors hover:bg-muted/30">
                                            <span className="flex w-10 shrink-0 select-none items-center justify-end border-r-2 border-border/40 pr-3 text-xs text-muted-foreground/60 transition-colors group-hover:border-border/80 group-hover:text-muted-foreground/80">
                                                {line.lineNumber}
                                            </span>
                                            <span className="whitespace-pre-wrap pl-4">{line.text}</span>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <CardTitle>Question {activePassageQuestionIndex + 1}</CardTitle>
                                    <CardDescription>Answer this question with direct reference to the passage.</CardDescription>
                                </div>
                                <Badge variant="secondary">{activeQuestion.maxMarks} marks</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                            <div className="rounded-xl border border-border/70 bg-muted/10 p-4">
                                <MarkdownMath content={activeQuestion.promptMarkdown} />
                            </div>

                            <div className="space-y-3">
                                <Label htmlFor="passage-answer">Your response</Label>
                                <Textarea
                                    id="passage-answer"
                                    className="min-h-[10rem]"
                                    value={activeAnswer}
                                    onChange={(event) => {
                                        const nextValue = event.target.value;
                                        setPassageAnswersByQuestionId((prev) => ({
                                            ...prev,
                                            [activeQuestion.id]: nextValue,
                                        }));
                                    }}
                                    placeholder="Write a concise English Language response using accurate metalanguage and line references."
                                />
                                <div className="flex items-center gap-3">
                                    <Button onClick={handleSubmitAnswer} disabled={!canSubmit}>
                                        {isMarking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                        Submit for Marking
                                    </Button>
                                </div>
                            </div>

                            {activeFeedback ? (
                                <div className="mt-8 space-y-6 rounded-2xl border border-border/70 bg-muted/5 p-5 shadow-sm">
                                    <div className="flex items-center gap-2">
                                        <ListChecks className="h-5 w-5 text-primary" />
                                        <h2 className="text-lg font-semibold tracking-tight">Marking & Feedback</h2>
                                    </div>
                                    <Separator />
                                    
                                    <div className="flex flex-wrap items-center gap-3">
                                        <Badge variant={renderScoreVariant(activeFeedback.achievedMarks, activeFeedback.maxMarks)} className="px-3 py-1 text-sm">
                                            {activeFeedback.achievedMarks}/{activeFeedback.maxMarks} marks
                                        </Badge>
                                        <Badge variant={activeFeedback.achievedMarks >= activeFeedback.maxMarks ? "default" : "outline"} className="flex items-center gap-1.5 px-3 py-1 text-sm">
                                            {activeFeedback.achievedMarks >= activeFeedback.maxMarks ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                            {activeFeedback.verdict}
                                        </Badge>
                                        <Badge variant="secondary" className="px-3 py-1 text-sm text-muted-foreground">Score {activeFeedback.scoreOutOf10}/10</Badge>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                                            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                                                <Lightbulb className="h-4 w-4" />
                                                Feedback
                                            </h3>
                                            <div className="text-sm text-foreground/90">
                                                <MarkdownMath content={activeFeedback.feedbackMarkdown} />
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-sm">
                                            <h3 className="mb-3 text-sm font-semibold text-card-foreground">Worked Solution</h3>
                                            <div className="text-sm text-muted-foreground">
                                                <MarkdownMath content={activeFeedback.workedSolutionMarkdown} />
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <h3 className="text-sm font-semibold text-foreground">Marking Scheme Breakdown</h3>
                                            <div className="space-y-3">
                                                {activeFeedback.vcaaMarkingScheme.map((criterion, index) => (
                                                    <div key={`${activeQuestion.id}-${index}`} className="flex flex-col gap-2 rounded-xl border border-border/50 bg-background p-4 shadow-sm transition-colors hover:border-border">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <span className="text-sm font-medium leading-snug">{criterion.criterion}</span>
                                                            <Badge variant="secondary" className="shrink-0">
                                                                {criterion.achievedMarks}/{criterion.maxMarks}
                                                            </Badge>
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            <MarkdownMath content={criterion.rationale} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {debugMode && passageRawModelOutput.trim().length > 0 ? (
                                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/10 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <h3 className="text-sm font-semibold">Raw Model Output</h3>
                                        <Button type="button" variant="outline" size="sm" onClick={() => setShowRawOutput((open) => !open)}>
                                            {showRawOutput ? "Hide" : "Show"}
                                        </Button>
                                    </div>
                                    {showRawOutput ? (
                                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap wrap-break-word rounded-lg bg-background p-3 text-xs">
                                            {passageRawModelOutput}
                                        </pre>
                                    ) : null}
                                </div>
                            ) : null}
                        </CardContent>
                    </Card>

                    {passageGenerationTelemetry ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Generation Details</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline">Attempts {passageGenerationTelemetry.totalAttempts}</Badge>
                                <Badge variant="outline">Repairs {passageGenerationTelemetry.repairAttempts}</Badge>
                                <Badge variant="outline">Duration {formatDurationMs(passageGenerationTelemetry.durationMs)}</Badge>
                                {passageGenerationTelemetry.structuredOutputStatus ? (
                                    <Badge variant="outline">Structured output {passageGenerationTelemetry.structuredOutputStatus}</Badge>
                                ) : null}
                            </CardContent>
                        </Card>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}