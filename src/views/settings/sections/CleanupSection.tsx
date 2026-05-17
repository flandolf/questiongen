import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { useAppContext } from '@/AppContext';
import { Button } from '@/components/ui/button';

import {
  BIOLOGY_SUBTOPICS,
  CHEMISTRY_SUBTOPICS,
  GENERAL_MATHEMATICS_SUBTOPICS,
  MATH_METHODS_SUBTOPICS,
  PHYSICAL_EDUCATION_SUBTOPICS,
  SPECIALIST_MATH_SUBTOPICS,
  TOPICS,
} from '../../../types';
import { SectionHeader } from '../SettingsUI';

const SUBJECT_TO_SUBTOPICS: Record<string, readonly string[]> = {
  'Mathematical Methods': MATH_METHODS_SUBTOPICS,
  'Specialist Mathematics': SPECIALIST_MATH_SUBTOPICS,
  Chemistry: CHEMISTRY_SUBTOPICS,
  Biology: BIOLOGY_SUBTOPICS,
  'Physical Education': PHYSICAL_EDUCATION_SUBTOPICS,
  'General Mathematics': GENERAL_MATHEMATICS_SUBTOPICS,
};

type MismatchGroup = {
  subtopic: string;
  currentTopic: string;
  correctTopic: string;
  count: number;
};

export function CleanupSection() {
  const {
    questionHistory,
    updateQuestionHistoryEntries,
    mcHistory,
    updateMcHistoryEntries,
  } = useAppContext();

  const [fixCount, setFixCount] = useState<number | null>(null);

  const subtopicToSubject = useMemo(() => {
    const map: Record<string, string> = {};
    for (const subject of TOPICS) {
      const subs = SUBJECT_TO_SUBTOPICS[subject] ?? [];
      for (const s of subs) map[s] = subject;
    }
    return map;
  }, []);

  const mismatchGroups = useMemo(() => {
    const groups: Record<string, MismatchGroup> = {};

    const process = (topic: string | undefined, subtopic: string | undefined) => {
      if (!subtopic || !topic) return;
      const correct = subtopicToSubject[subtopic];
      if (!correct || correct === topic) return;
      const key = `${subtopic}|||${topic}|||${correct}`;
      if (groups[key]) {
        groups[key].count++;
      } else {
        groups[key] = { subtopic, currentTopic: topic, correctTopic: correct, count: 1 };
      }
    };

    for (const e of questionHistory) process(e.question.topic, e.question.subtopic);
    for (const e of mcHistory) process(e.question.topic, e.question.subtopic);

    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [questionHistory, mcHistory, subtopicToSubject]);

  const totalMismatches = useMemo(
    () => mismatchGroups.reduce((sum, g) => sum + g.count, 0),
    [mismatchGroups],
  );

  const handleFix = useCallback(() => {
    const subjectMapping: Record<string, string> = {};
    for (const g of mismatchGroups) {
      subjectMapping[g.subtopic] = g.correctTopic;
    }

    const updatedWritten: Parameters<typeof updateQuestionHistoryEntries>[0] = [];
    for (const entry of questionHistory) {
      const st = entry.question.subtopic;
      if (!st) continue;
      const mapped = subjectMapping[st];
      if (!mapped || entry.question.topic === mapped) continue;
      updatedWritten.push({
        ...entry,
        question: { ...entry.question, topic: mapped },
        lastModified: Date.now(),
      });
    }

    const updatedMc: Parameters<typeof updateMcHistoryEntries>[0] = [];
    for (const entry of mcHistory) {
      const st = entry.question.subtopic;
      if (!st) continue;
      const mapped = subjectMapping[st];
      if (!mapped || entry.question.topic === mapped) continue;
      updatedMc.push({
        ...entry,
        question: { ...entry.question, topic: mapped },
        lastModified: Date.now(),
      });
    }

    if (updatedWritten.length > 0) updateQuestionHistoryEntries(updatedWritten);
    if (updatedMc.length > 0) updateMcHistoryEntries(updatedMc);

    setFixCount(updatedWritten.length + updatedMc.length);
  }, [
    mismatchGroups,
    questionHistory,
    mcHistory,
    updateQuestionHistoryEntries,
    updateMcHistoryEntries,
  ]);

  return (
    <div className="space-y-8 pb-12">
      <SectionHeader
        title="Subject Normalization"
        description="Ensure each question's subject matches the canonical subject for its subtopic."
      />

      <div>
        {fixCount !== null ? (
          <div className="flex items-start gap-6 p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0 mt-0.5">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                Subjects Normalized
              </h3>
              <p className="text-sm text-muted-foreground">
                Updated {fixCount} {fixCount === 1 ? 'entry' : 'entries'} across your history.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setFixCount(null)}
              className="shrink-0 ml-auto"
            >
              Re-check
            </Button>
          </div>
        ) : totalMismatches === 0 ? (
          <div className="flex items-start gap-6 p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0 mt-0.5">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                All Subjects Correct
              </h3>
              <p className="text-sm text-muted-foreground">
                Every entry's subject matches its subtopic's canonical parent subject.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card">
            <div className="px-8 pt-8 pb-4">
              <span className="text-4xl font-black tabular-nums tracking-tight">
                {totalMismatches}
              </span>
              <p className="text-sm text-muted-foreground mt-2">
                {totalMismatches === 1 ? 'entry has' : 'entries have'} a subject that
                doesn't match the canonical parent of its subtopic.
              </p>
            </div>

            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-y border-border/40">
                    <th className="text-left px-8 py-2.5 font-medium text-muted-foreground/70 tracking-wide">
                      Subtopic
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground/70 tracking-wide">
                      From
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground/70 tracking-wide">
                      To
                    </th>
                    <th className="text-right px-8 py-2.5 font-medium text-muted-foreground/70 tracking-wide w-16">
                      #
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mismatchGroups.map((g) => (
                    <tr
                      key={`${g.subtopic}|||${g.currentTopic}`}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-8 py-3 font-mono font-medium text-foreground">
                        {g.subtopic}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground/60 line-through">
                        {g.currentTopic}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                          <ArrowRight className="h-3 w-3" />
                          {g.correctTopic}
                        </span>
                      </td>
                      <td className="px-8 py-3 text-right tabular-nums text-muted-foreground">
                        {g.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-8 py-4 border-t border-border/40">
              <p className="text-xs text-muted-foreground">
                {totalMismatches} {totalMismatches === 1 ? 'entry' : 'entries'} across{' '}
                {mismatchGroups.length} {mismatchGroups.length === 1 ? 'subtopic' : 'subtopics'}
              </p>
              <Button
                onClick={handleFix}
                className="gap-2 shadow-lg shadow-primary/20 transition-all active:scale-95"
              >
                <Sparkles className="h-4 w-4" />
                Fix All Mismatches
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
