import { invoke } from '@tauri-apps/api/core';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileText,
  Info,
  Trophy,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import {
  PageContainer,
  PageHeader,
  SearchInput,
  SectionLabel,
  StatCard,
} from '@/components/layout/primitives';
import { MarkdownMath } from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
import { SPRING } from '@/lib/motion';
import { scoreColorBgClass } from '@/lib/score-utils';
import { useAppStore } from '@/store';
import type { GeneratedQuestion, MarkAnswerResponse } from '@/types';

export function PDFMarkingResultsView() {
  const navigate = useNavigate();
  const {
    pdfMarkerQuestions,
    pdfMarkerResultsByQuestionId,
    resetPdfMarker,
    clearPdfMarkerResults,
  } = useAppStore();

  const [expandedQuestionIds, setExpandedQuestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<
    'all' | 'full' | 'partial' | 'zero'
  >('all');
  const [sortOrder, setSortOrder] = useState<
    'default' | 'score-asc' | 'score-desc' | 'topic'
  >('default');

  const hasActiveFilters = scoreFilter !== 'all' || searchQuery.trim() !== '';

  const results = useMemo(() => {
    return pdfMarkerQuestions
      .map((q) => ({
        question: q,
        result: pdfMarkerResultsByQuestionId[q.id],
      }))
      .filter((r) => !!r.result);
  }, [pdfMarkerQuestions, pdfMarkerResultsByQuestionId]);

  const stats = useMemo(() => {
    let achieved = 0;
    let max = 0;
    for (const r of results) {
      achieved += r.result.achievedMarks;
      max += r.result.maxMarks;
    }
    const pct = max > 0 ? (achieved / max) * 100 : 0;
    return { achieved, max, pct };
  }, [results]);

  const filteredResults = useMemo(() => {
    let filtered = results;

    if (searchQuery.trim()) {
      const s = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.question.topic.toLowerCase().includes(s) ||
          r.question.promptMarkdown.toLowerCase().includes(s),
      );
    }

    filtered = filtered.filter((r) => {
      const pct =
        r.result.maxMarks > 0 ? r.result.achievedMarks / r.result.maxMarks : 0;
      if (scoreFilter === 'full') return pct === 1;
      if (scoreFilter === 'partial') return pct > 0 && pct < 1;
      if (scoreFilter === 'zero') return pct === 0;
      return true;
    });

    if (sortOrder === 'score-asc') {
      filtered = [...filtered].sort(
        (a, b) =>
          a.result.achievedMarks / a.result.maxMarks -
          b.result.achievedMarks / b.result.maxMarks,
      );
    } else if (sortOrder === 'score-desc') {
      filtered = [...filtered].sort(
        (a, b) =>
          b.result.achievedMarks / b.result.maxMarks -
          a.result.achievedMarks / a.result.maxMarks,
      );
    } else if (sortOrder === 'topic') {
      filtered = [...filtered].sort((a, b) =>
        a.question.topic.localeCompare(b.question.topic),
      );
    }

    return filtered;
  }, [results, searchQuery, scoreFilter, sortOrder]);

  const toggleExpand = (id: string) => {
    setExpandedQuestionIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportToAnki = async (
    question: GeneratedQuestion,
    result: MarkAnswerResponse,
  ) => {
    try {
      const answer = `${result.feedbackMarkdown}\n\n### Worked Solution\n${result.workedSolutionMarkdown}`;
      const res = await invoke<{
        success: boolean;
        filePath?: string;
        errorMessage?: string;
      }>('export_question_to_anki', {
        request: {
          id: question.id,
          question: question.promptMarkdown,
          answer,
          topic: question.topic,
          subtopic: question.subtopic ?? '',
        },
      });
      if (res.success) {
        toast.success(`Exported: ${res.filePath}`);
        if (res.errorMessage) toast.warning(res.errorMessage);
      } else {
        toast.error(`Export failed: ${res.errorMessage}`);
      }
    } catch (e) {
      toast.error(
        `Export error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const copyFeedback = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  if (results.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title='No Results'
          description='Mark some questions in the PDF Marker to see results here.'
          actions={
            <Button onClick={() => void navigate('/pdf-marker')}>
              <ArrowLeft className='w-4 h-4 mr-2' /> Back to Marker
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title='Marking Report'
        description='Detailed breakdown of your exam responses analyzed by AI.'
        actions={
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                clearPdfMarkerResults();
                void navigate('/pdf-marker');
              }}
            >
              <ArrowLeft className='w-4 h-4 mr-2' /> Edit Mapping
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                for (const r of results) {
                  void exportToAnki(r.question, r.result);
                }
              }}
            >
              <Download className='w-4 h-4 mr-2' /> Export All to Anki
            </Button>
            <Button
              variant='destructive'
              size='sm'
              onClick={() => {
                resetPdfMarker();
                void navigate('/pdf-marker');
              }}
            >
              Reset Session
            </Button>
          </div>
        }
      />

      {/* Filter & Sort Controls */}
      <div className='flex flex-wrap items-center gap-3 mb-6'>
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder='Search by topic...'
          className='w-64'
        />
        <div className='flex items-center gap-1 rounded-sm border bg-muted/30 p-0.5'>
          {(['all', 'full', 'partial', 'zero'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setScoreFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                scoreFilter === f
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all'
                ? 'All'
                : f === 'full'
                  ? 'Full'
                  : f === 'partial'
                    ? 'Partial'
                    : 'Zero'}
            </button>
          ))}
        </div>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
          className='h-9 px-3 text-xs rounded-sm border bg-background text-foreground'
        >
          <option value='default'>Default Order</option>
          <option value='score-asc'>Score: Low to High</option>
          <option value='score-desc'>Score: High to Low</option>
          <option value='topic'>Sort by Topic</option>
        </select>
        {hasActiveFilters && (
          <span className='text-xs text-muted-foreground'>
            Showing {filteredResults.length} of {results.length} results
          </span>
        )}
      </div>

      {/* Summary KPI Row */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...SPRING, delay: 0.1 }}
        className='grid grid-cols-1 md:grid-cols-4 gap-3 mb-8'
      >
        <StatCard
          label='Total Score'
          value={
            <div className='flex items-baseline gap-1'>
              <span>{stats.achieved}</span>
              <span className='text-sm font-light text-muted-foreground/50'>
                / {stats.max}
              </span>
            </div>
          }
          icon={<Trophy className='w-3 h-3' />}
          accentColor='bg-primary/5 border-primary/20'
        />
        <StatCard
          label='Accuracy'
          value={`${Math.round(stats.pct)}%`}
          subValue='VCAA-aligned'
          accentColor='bg-muted/30'
        />
        <div className='md:col-span-2 flex flex-col justify-center p-4 rounded-sm border bg-muted/10 space-y-3'>
          <div className='flex items-center justify-between'>
            <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80'>
              Overall Performance
            </span>
            <span className='text-xs font-black tabular-nums'>
              {Math.round(stats.pct)}%
            </span>
          </div>
          <div className='h-1.5 w-full bg-muted rounded-full overflow-hidden relative'>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.pct}%` }}
              transition={{ duration: 1.2, ease: 'circOut' }}
              className='h-full bg-primary'
            />
          </div>
          <p className='text-[10px] text-muted-foreground/60 leading-tight'>
            Analysis of <strong>{filteredResults.length}</strong> questions
            against VCE key knowledge and skills.
          </p>
        </div>
      </motion.div>

      <div className='space-y-6 pb-20'>
        <SectionLabel>Question Breakdown</SectionLabel>

        <div className='grid gap-3'>
          {filteredResults.map((r, idx) => {
            const isExpanded = expandedQuestionIds.has(r.question.id);
            const pct =
              r.result.maxMarks > 0
                ? r.result.achievedMarks / r.result.maxMarks
                : 0;

            return (
              <motion.div
                key={r.question.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + idx * 0.05 }}
              >
                <div
                  className={`group relative flex flex-col overflow-hidden rounded-sm border transition-all duration-300 ${
                    isExpanded
                      ? 'border-primary/30 ring-1 ring-primary/10 shadow-lg'
                      : 'hover:border-border-strong hover:bg-muted/5'
                  }`}
                >
                  <div
                    className='flex items-center justify-between p-4 cursor-pointer select-none'
                    onClick={() => toggleExpand(r.question.id)}
                  >
                    <div className='flex items-center gap-5 min-w-0'>
                      <div
                        className={`w-12 h-12 rounded-sm flex flex-col items-center justify-center shrink-0 border ${scoreColorBgClass(pct)}`}
                      >
                        <span className='font-black text-lg leading-none'>
                          {r.result.achievedMarks}
                        </span>
                        <div className='w-6 h-px bg-current/20 my-1' />
                        <span className='font-bold text-[10px] opacity-60'>
                          {r.result.maxMarks}
                        </span>
                      </div>
                      <div className='min-w-0 space-y-0.5'>
                        <h3 className='font-black text-sm tracking-tight truncate group-hover:text-primary transition-colors'>
                          {r.question.topic}
                        </h3>
                        <p className='text-[10px] text-muted-foreground line-clamp-1 font-normal italic'>
                          {r.question.promptMarkdown}
                        </p>
                      </div>
                    </div>
                    <div className='flex items-center gap-3'>
                      <div className='hidden sm:flex flex-col items-end mr-4'>
                        <span className='text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest'>
                          Result
                        </span>
                        <span className='text-[10px] font-black uppercase'>
                          {pct === 1
                            ? 'Full Marks'
                            : pct > 0
                              ? 'Partial'
                              : 'No Marks'}
                        </span>
                      </div>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-8 w-8 rounded-full'
                      >
                        {isExpanded ? (
                          <ChevronUp className='w-4 h-4' />
                        ) : (
                          <ChevronDown className='w-4 h-4' />
                        )}
                      </Button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'circOut' }}
                      >
                        <div className='border-t bg-muted/5 p-6 space-y-10'>
                          {/* AI Feedback Section */}
                          <div className='space-y-4'>
                            <div className='flex items-center justify-between'>
                              <div className='flex items-center gap-2'>
                                <div className='w-1.5 h-1.5 rounded-full bg-primary' />
                                <span className='text-[10px] font-bold uppercase tracking-wider text-primary'>
                                  Detailed AI Feedback
                                </span>
                              </div>
                              <div className='flex gap-1'>
                                <Button
                                  variant='ghost'
                                  size='sm'
                                  className='h-7 text-xs'
                                  onClick={() =>
                                    copyFeedback(r.result.feedbackMarkdown)
                                  }
                                >
                                  <Copy className='w-3 h-3 mr-1' /> Copy
                                </Button>
                              </div>
                            </div>
                            <div className='prose prose-sm dark:prose-invert max-w-none bg-background border border-primary/10 rounded-sm p-6 shadow-inner'>
                              <MarkdownMath
                                content={r.result.feedbackMarkdown}
                              />
                            </div>
                          </div>

                          {/* Criteria Table */}
                          <div className='space-y-4'>
                            <div className='flex items-center gap-2'>
                              <div className='w-1.5 h-1.5 rounded-full bg-muted-foreground/30' />
                              <span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80'>
                                Marking Criteria Breakdown
                              </span>
                            </div>
                            <div className='grid gap-2'>
                              {r.result.vcaaMarkingScheme.map((c, cIdx) => (
                                <div
                                  key={cIdx}
                                  className='flex gap-4 justify-between rounded-sm border bg-background p-4 text-sm'
                                >
                                  <div className='space-y-1 flex-1'>
                                    <p className='font-black text-xs uppercase tracking-tight text-foreground'>
                                      {c.criterion}
                                    </p>
                                    <p className='text-[11px] text-muted-foreground leading-relaxed font-normal'>
                                      {c.rationale}
                                    </p>
                                  </div>
                                  <div className='flex flex-col items-end gap-1 shrink-0'>
                                    <span className='font-black text-sm tabular-nums'>
                                      {c.achievedMarks} / {c.maxMarks}
                                    </span>
                                    <div className='w-16 h-1 bg-muted rounded-full overflow-hidden'>
                                      <div
                                        className={`h-full ${
                                          c.achievedMarks === c.maxMarks
                                            ? 'bg-emerald-500'
                                            : c.achievedMarks > 0
                                              ? 'bg-amber-500'
                                              : 'bg-muted-foreground/20'
                                        }`}
                                        style={{
                                          width: `${(c.achievedMarks / c.maxMarks) * 100}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Comparative Analysis */}
                          <div className='grid md:grid-cols-2 gap-8 pt-4'>
                            <div className='space-y-4'>
                              <div className='flex items-center gap-2 text-emerald-600 dark:text-emerald-400'>
                                <FileText className='w-3 h-3' />
                                <span className='text-[10px] font-bold uppercase tracking-wider'>
                                  Model Solution
                                </span>
                              </div>
                              <div className='bg-emerald-500/3 border border-emerald-500/20 rounded-sm p-5 text-sm font-normal'>
                                <MarkdownMath
                                  content={r.result.workedSolutionMarkdown}
                                />
                              </div>
                            </div>

                            <div className='space-y-4'>
                              <div className='flex items-center gap-2 text-amber-600 dark:text-amber-400'>
                                <Info className='w-3 h-3' />
                                <span className='text-[10px] font-bold uppercase tracking-wider'>
                                  Gap Analysis
                                </span>
                              </div>
                              <div className='bg-amber-500/3 border border-amber-500/20 rounded-sm p-5 text-sm font-normal'>
                                <MarkdownMath
                                  content={
                                    r.result.comparisonToSolutionMarkdown
                                  }
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </PageContainer>
  );
}
