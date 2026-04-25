import { format } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  FileText,
  Search,
  Trash2,
  Trophy,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { PageContainer, PageHeader } from '@/components/layout/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { scoreColorBgClass } from '@/lib/score-utils';
import { useAppStore } from '@/store';

export function PDFMarkerHistoryView() {
  const navigate = useNavigate();
  const {
    pdfMarkerHistory,
    loadPdfMarkerHistoryEntry,
    deletePdfMarkerHistoryEntry,
  } = useAppStore();
  const [search, setSearch] = useState('');

  const history = pdfMarkerHistory;

  const filteredHistory = useMemo(() => {
    if (!search.trim()) return history;
    const s = search.toLowerCase();
    return history.filter((h) => {
      const dateStr = format(new Date(h.createdAt), 'PPP').toLowerCase();
      const matchTopic = h.questions.some((q) =>
        q.topic.toLowerCase().includes(s),
      );
      return matchTopic || dateStr.includes(s);
    });
  }, [history, search]);

  const handleLoad = (id: string) => {
    loadPdfMarkerHistoryEntry(id);
    void navigate('/pdf-marker/results');
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deletePdfMarkerHistoryEntry(id);
    toast.success('History entry deleted');
  };

  return (
    <PageContainer>
      <PageHeader
        title='Marking History'
        description='Review your past PDF assessments and AI evaluations.'
        actions={
          <Button
            variant='outline'
            onClick={() => void navigate('/pdf-marker')}
          >
            <ArrowLeft className='w-4 h-4 mr-2' /> Back to Marker
          </Button>
        }
      />

      <div className='flex flex-col gap-6'>
        {/* Search & Stats */}
        <div className='flex flex-col md:flex-row gap-4 items-center justify-between'>
          <div className='relative w-full md:w-96'>
            <Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground' />
            <Input
              placeholder='Search by topic or date...'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className='pl-10 h-10 rounded-xl bg-card/50'
            />
          </div>
          <div className='flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground/60'>
            <Clock className='w-3.5 h-3.5' />
            {history.length} Sessions Recorded
          </div>
        </div>

        {/* History List */}
        <div className='space-y-3 pb-12'>
          {filteredHistory.length === 0 ? (
            <Card className='bg-muted/5 border-dashed border-2 py-20'>
              <CardContent className='flex flex-col items-center justify-center text-center'>
                <div className='w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4'>
                  <Clock className='w-6 h-6 text-muted-foreground/40' />
                </div>
                <h3 className='text-lg font-medium text-foreground/80'>
                  No sessions found
                </h3>
                <p className='text-sm text-muted-foreground max-w-xs mt-1'>
                  {search
                    ? 'No results match your search.'
                    : 'Complete a PDF marking session to see it recorded here.'}
                </p>
                {search && (
                  <Button
                    variant='ghost'
                    onClick={() => setSearch('')}
                    className='mt-4'
                  >
                    Clear Search
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <AnimatePresence mode='popLayout'>
              {filteredHistory.map((entry, idx) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: idx * 0.05 }}
                  layout
                >
                  <Card
                    className='group cursor-pointer hover:ring-2 hover:ring-primary/20 hover:border-primary/30 transition-all shadow-sm bg-card/50 overflow-hidden'
                    onClick={() => handleLoad(entry.id)}
                  >
                    <CardContent className='p-4'>
                      <div className='flex items-center justify-between gap-4'>
                        <div className='flex items-center gap-4 min-w-0'>
                          <div
                            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 shadow-sm ${scoreColorBgClass(entry.stats.pct / 100)}`}
                          >
                            <span className='font-black text-sm tabular-nums'>
                              {Math.round(entry.stats.pct)}%
                            </span>
                            <span className='text-[8px] font-bold uppercase tracking-tighter opacity-70'>
                              Score
                            </span>
                          </div>

                          <div className='min-w-0'>
                            <div className='flex items-center gap-2 mb-0.5'>
                              <span className='font-bold text-sm tracking-tight truncate'>
                                {format(new Date(entry.createdAt), 'PPP')}
                              </span>
                              <Badge
                                variant='secondary'
                                className='text-[9px] font-bold py-0 h-4 uppercase tracking-tighter bg-muted/50'
                              >
                                {entry.questions.length} Questions
                              </Badge>
                            </div>
                            <div className='flex items-center gap-3 text-xs text-muted-foreground'>
                              <div className='flex items-center gap-1'>
                                <Trophy className='w-3 h-3' />
                                <span className='font-mono'>
                                  {Number(entry.stats.achieved)}/
                                  {Number(entry.stats.max)}
                                </span>
                              </div>
                              <div className='flex items-center gap-1'>
                                <FileText className='w-3 h-3' />
                                <span className='truncate max-w-[200px]'>
                                  {entry.questions[0]?.topic || 'Untitled'}
                                  {entry.questions.length > 1 &&
                                    ` +${entry.questions.length - 1} more`}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className='flex items-center gap-2 shrink-0'>
                          <Button
                            variant='ghost'
                            size='icon'
                            className='h-8 w-8 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all'
                            onClick={(e) => handleDelete(e, entry.id)}
                          >
                            <Trash2 className='w-4 h-4' />
                          </Button>
                          <ChevronRight className='w-5 h-5 text-muted-foreground/30' />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
