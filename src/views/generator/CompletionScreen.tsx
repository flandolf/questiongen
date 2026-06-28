import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  RefreshCw,
  Target,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { MarkdownMath } from '@/components/MarkdownMath';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Difficulty, QuestionMode } from '@/types';
import { percent, useAnalyticsData } from '@/views/useAnalyticsData';

import { AccuracyTrendChart } from './AccuracyTrendChart';

type PerQuestionTiming = {
  questionId: string;
  timeUsedSeconds: number;
  timeLimitSeconds: number;
  finishedEarly: boolean;
};

type WrittenResultRow = {
  id: string;
  topic: string;
  subtopic?: string;
  scorePercent: number;
  achieved: number;
  max: number;
  wordCount: number;
  criterionBreakdown?: Array<{
    criterion: string;
    achieved: number;
    available: number;
  }>;
};

type McResultRow = {
  id: string;
  topic: string;
  subtopic?: string;
  correct: boolean;
  selected: string;
  correctAnswer: string;
};

type CompletionScreenProps = {
  questionMode: QuestionMode;
  difficulty: Difficulty;
  accuracyPercent: number;
  formattedElapsedTime: string;
  completedCount: number;
  totalCount: number;
  onReview: () => void | Promise<void>;
  onStartOver: () => void | Promise<void>;
  perQuestionTiming?: PerQuestionTiming[];
  sessionWrittenResults?: WrittenResultRow[];
  sessionMcResults?: McResultRow[];
};

const EMPTY_WRITTEN_RESULTS: WrittenResultRow[] = [];
const EMPTY_MC_RESULTS: McResultRow[] = [];

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

function getResultLabel(pct: number) {
  if (pct >= 90) return 'Excellent';
  if (pct >= 70) return 'Good';
  if (pct >= 50) return 'Developing';
  return 'Needs review';
}

function getResultVariant(pct: number): 'default' | 'secondary' | 'destructive' {
  if (pct >= 70) return 'default';
  if (pct >= 50) return 'secondary';
  return 'destructive';
}

function StatCard({
  title,
  value,
  description,
  icon: Icon,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card size='sm'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-muted-foreground'>
          <Icon className='size-3.5' />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-1'>
        <div className='font-mono text-2xl font-semibold tabular-nums'>
          {value}
        </div>
        <p className='text-xs text-muted-foreground'>{description}</p>
      </CardContent>
    </Card>
  );
}

export const CompletionScreen = memo(function CompletionScreen({
  questionMode,
  difficulty,
  accuracyPercent,
  formattedElapsedTime,
  completedCount,
  totalCount,
  onReview,
  onStartOver,
  perQuestionTiming,
  sessionWrittenResults = EMPTY_WRITTEN_RESULTS,
  sessionMcResults = EMPTY_MC_RESULTS,
}: CompletionScreenProps) {
  const { summary, trendData } = useAnalyticsData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'incorrect' | 'slow'>('all');

  const totalMarks = useMemo(() => {
    if (questionMode !== 'written' || sessionWrittenResults.length === 0) {
      return null;
    }

    return sessionWrittenResults.reduce(
      (total, row) => ({
        achieved: total.achieved + row.achieved,
        max: total.max + row.max,
      }),
      { achieved: 0, max: 0 },
    );
  }, [questionMode, sessionWrittenResults]);

  const scoreDisplay =
    questionMode === 'written' && totalMarks
      ? `${totalMarks.achieved}/${totalMarks.max}`
      : `${completedCount}/${totalCount}`;

  const timingMap = useMemo(() => {
    const map = new Map<string, PerQuestionTiming>();
    perQuestionTiming?.forEach((timing) => map.set(timing.questionId, timing));
    return map;
  }, [perQuestionTiming]);

  const sessionTopics = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    const rows = questionMode === 'written' ? sessionWrittenResults : sessionMcResults;

    for (const row of rows) {
      const bucket = map.get(row.topic) ?? { correct: 0, total: 0 };
      bucket.total += 1;
      bucket.correct +=
        questionMode === 'written'
          ? (row as WrittenResultRow).scorePercent >= 100
            ? 1
            : 0
          : (row as McResultRow).correct
            ? 1
            : 0;
      map.set(row.topic, bucket);
    }

    return Array.from(map.entries())
      .map(([topic, bucket]) => ({
        topic,
        correct: bucket.correct,
        total: bucket.total,
        pct: percent(bucket.correct, bucket.total),
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [questionMode, sessionWrittenResults, sessionMcResults]);

  const sessionCriteria = useMemo(() => {
    if (questionMode !== 'written') return [];

    const map = new Map<string, { achieved: number; available: number }>();
    for (const result of sessionWrittenResults) {
      for (const criterion of result.criterionBreakdown ?? []) {
        if (criterion.available <= 0) continue;
        const bucket = map.get(criterion.criterion) ?? {
          achieved: 0,
          available: 0,
        };
        bucket.achieved += criterion.achieved;
        bucket.available += criterion.available;
        map.set(criterion.criterion, bucket);
      }
    }

    return Array.from(map.entries())
      .map(([criterion, bucket]) => ({
        criterion,
        achieved: bucket.achieved,
        available: bucket.available,
        successPct: percent(bucket.achieved, bucket.available),
        lostMarks: bucket.available - bucket.achieved,
      }))
      .filter((row) => row.lostMarks > 0)
      .sort((a, b) => b.lostMarks - a.lostMarks || a.successPct - b.successPct)
      .slice(0, 4);
  }, [questionMode, sessionWrittenResults]);

  const weakTopics = sessionTopics.filter((topic) => topic.pct < 75);

  const filteredQuestions = useMemo(() => {
    const rows = questionMode === 'written' ? sessionWrittenResults : sessionMcResults;
    return rows.filter((row) => {
      if (filter === 'all') return true;
      if (filter === 'slow') {
        const timing = timingMap.get(row.id);
        return Boolean(timing && timing.timeUsedSeconds > timing.timeLimitSeconds);
      }
      return questionMode === 'written'
        ? (row as WrittenResultRow).scorePercent < 100
        : !(row as McResultRow).correct;
    });
  }, [filter, questionMode, sessionWrittenResults, sessionMcResults, timingMap]);

  return (
    <div className='flex min-h-full w-full flex-col bg-background'>
      <main className='mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8'>
        <Card>
          <CardHeader className='gap-3 sm:grid-cols-[1fr_auto]'>
            <div className='flex flex-col gap-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant={getResultVariant(accuracyPercent)}>
                  {getResultLabel(accuracyPercent)}
                </Badge>
                <Badge variant='outline'>{questionMode}</Badge>
                <Badge variant='outline'>{difficulty}</Badge>
              </div>
              <div className='flex flex-col gap-2'>
                <CardTitle className='text-2xl font-semibold'>
                  Session complete
                </CardTitle>
                <CardDescription className='max-w-2xl'>
                  Review the score, weak topics, and question-level results
                  before starting the next set.
                </CardDescription>
              </div>
            </div>
            <CardAction className='hidden text-right sm:block'>
              <div className='font-mono text-5xl font-semibold tabular-nums'>
                {accuracyPercent.toFixed(0)}%
              </div>
              <p className='text-xs text-muted-foreground'>accuracy</p>
            </CardAction>
          </CardHeader>
          <CardContent className='flex flex-col gap-6'>
            <div className='sm:hidden'>
              <div className='font-mono text-5xl font-semibold tabular-nums'>
                {accuracyPercent.toFixed(0)}%
              </div>
              <p className='text-xs text-muted-foreground'>accuracy</p>
            </div>
            <Progress value={accuracyPercent} />
            <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <StatCard
                icon={Target}
                title='Score'
                value={scoreDisplay}
                description={
                  questionMode === 'written'
                    ? 'marks achieved'
                    : 'questions correct'
                }
              />
              <StatCard
                icon={Clock}
                title='Time'
                value={formattedElapsedTime}
                description='total elapsed'
              />
              <StatCard
                icon={TrendingUp}
                title='Lifetime'
                value={`${summary.overallAccuracy.toFixed(1)}%`}
                description={`${summary.totalAttempts} attempts`}
              />
              <StatCard
                icon={FileText}
                title={questionMode === 'written' ? 'Written avg' : 'MC accuracy'}
                value={
                  questionMode === 'written'
                    ? summary.writtenAttempts > 0
                      ? `${summary.writtenAverageScore.toFixed(1)}%`
                      : '-'
                    : summary.mcAttempts > 0
                      ? `${((summary.mcCorrect / summary.mcAttempts) * 100).toFixed(1)}%`
                      : '-'
                }
                description={
                  questionMode === 'written'
                    ? `${summary.writtenAttempts} sessions`
                    : `${summary.mcCorrect}/${summary.mcAttempts} answered`
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className='grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]'>
          <div className='flex flex-col gap-6'>
            <Card>
              <CardHeader>
                <CardTitle>Topic performance</CardTitle>
                <CardDescription>
                  Accuracy by topic for this session, sorted weakest first.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sessionTopics.length > 0 ? (
                  <div className='grid gap-4 md:grid-cols-2'>
                    {sessionTopics.map((topic) => (
                      <div key={topic.topic} className='flex flex-col gap-2'>
                        <div className='flex items-center justify-between gap-4'>
                          <div className='min-w-0'>
                            <p className='truncate text-sm font-medium'>
                              {topic.topic}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              {topic.correct}/{topic.total} correct
                            </p>
                          </div>
                          <span className='font-mono text-sm tabular-nums'>
                            {topic.pct.toFixed(0)}%
                          </span>
                        </div>
                        <Progress value={topic.pct} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No topic data</EmptyTitle>
                      <EmptyDescription>
                        This session did not return topic-level results.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>

            {weakTopics.length > 0 && (
              <Alert variant='destructive'>
                <AlertTriangle />
                <AlertTitle>
                  {weakTopics.length} topic{weakTopics.length > 1 ? 's' : ''}{' '}
                  need attention
                </AlertTitle>
                <AlertDescription className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                  <span>
                    Review mistakes from the areas under 75% before generating a
                    new set.
                  </span>
                  <Button
                    type='button'
                    variant='destructive'
                    size='sm'
                    onClick={() => void navigate('/mistakes')}
                  >
                    Review mistakes
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Question breakdown</CardTitle>
                  <CardDescription>
                    Every question, result, and recorded timing.
                  </CardDescription>
                </div>
                <CardAction>
                  <ToggleGroup
                    type='single'
                    value={filter}
                    onValueChange={(value) => {
                      if (value) setFilter(value as typeof filter);
                    }}
                    variant='outline'
                    size='sm'
                    spacing={0}
                  >
                    <ToggleGroupItem value='all'>All</ToggleGroupItem>
                    <ToggleGroupItem value='incorrect'>Incorrect</ToggleGroupItem>
                    <ToggleGroupItem value='slow'>Overtime</ToggleGroupItem>
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent>
                {filteredQuestions.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-12'>#</TableHead>
                        <TableHead>Topic</TableHead>
                        <TableHead className='hidden md:table-cell'>
                          Timing
                        </TableHead>
                        <TableHead className='text-right'>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredQuestions.map((row, index) => {
                        const timing = timingMap.get(row.id);
                        const isWritten = questionMode === 'written';
                        const written = row as WrittenResultRow;
                        const mc = row as McResultRow;
                        const correct = isWritten
                          ? written.scorePercent >= 100
                          : mc.correct;

                        return (
                          <TableRow key={row.id}>
                            <TableCell className='font-mono text-muted-foreground tabular-nums'>
                              {(index + 1).toString().padStart(2, '0')}
                            </TableCell>
                            <TableCell>
                              <div className='flex min-w-48 flex-col gap-1'>
                                <span className='font-medium'>{row.topic}</span>
                                {row.subtopic && (
                                  <span className='text-xs text-muted-foreground'>
                                    {row.subtopic}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className='hidden font-mono text-muted-foreground tabular-nums md:table-cell'>
                              {timing
                                ? `${formatTime(timing.timeUsedSeconds)} / ${formatTime(
                                    timing.timeLimitSeconds,
                                  )}`
                                : '-'}
                            </TableCell>
                            <TableCell className='text-right'>
                              <div className='flex items-center justify-end gap-2'>
                                {isWritten ? (
                                  <span className='font-mono tabular-nums'>
                                    {written.achieved}/{written.max} mk
                                  </span>
                                ) : correct ? (
                                  <span className='text-muted-foreground'>
                                    correct
                                  </span>
                                ) : (
                                  <span className='font-mono tabular-nums'>
                                    {mc.selected} -&gt; {mc.correctAnswer}
                                  </span>
                                )}
                                {correct ? (
                                  <CheckCircle2 className='size-4 text-primary' />
                                ) : (
                                  <XCircle className='size-4 text-destructive' />
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyMedia variant='icon'>
                      <AlertTriangle />
                    </EmptyMedia>
                    <EmptyHeader>
                      <EmptyTitle>No questions match this filter</EmptyTitle>
                      <EmptyDescription>
                        Switch filters to see the rest of the session.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          </div>

          <aside className='flex flex-col gap-6'>
            {trendData.length > 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Recent trend</CardTitle>
                  <CardDescription>Last 20 completed sessions.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className='h-36'>
                    <AccuracyTrendChart data={trendData.slice(-20)} minimal />
                  </div>
                </CardContent>
              </Card>
            )}

            {questionMode === 'written' && sessionCriteria.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Lost-mark criteria</CardTitle>
                  <CardDescription>
                    The clearest written-response targets for revision.
                  </CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                  {sessionCriteria.map((criterion) => (
                    <div key={criterion.criterion} className='flex flex-col gap-2'>
                      <div className='flex items-start justify-between gap-3'>
                        <div className='text-sm font-medium leading-snug'>
                          <MarkdownMath content={criterion.criterion} />
                        </div>
                        <Badge variant='outline'>
                          {criterion.achieved}/{criterion.available}
                        </Badge>
                      </div>
                      <Progress value={criterion.successPct} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Next step</CardTitle>
                <CardDescription>
                  Keep the feedback loop short while this session is fresh.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Separator />
              </CardContent>
              <CardFooter className='flex flex-col gap-2 sm:flex-row xl:flex-col'>
                <Button
                  type='button'
                  variant='outline'
                  className='w-full'
                  onClick={() => void onReview()}
                >
                  <BookOpen data-icon='inline-start' />
                  Review answers
                </Button>
                <Button
                  type='button'
                  className='w-full'
                  onClick={() => void onStartOver()}
                >
                  <RefreshCw data-icon='inline-start' />
                  New session
                </Button>
              </CardFooter>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
});
