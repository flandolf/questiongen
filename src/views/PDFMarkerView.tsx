import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  AlertCircle,
  BarChart,
  CheckCircle2,
  FileText,
  History,
  Play,
  Plus,
  RefreshCcw,
  Settings,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dropzone } from '@/components/ui/dropzone';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import type { AppState } from '@/store/types';
import type { GeneratedQuestion, MarkAnswerResponse } from '@/types';

import { MARKER_STYLE_OPTIONS, PRESET_MODELS } from './settings/constants';
import { ModelSearchPanel } from './settings/ModelSearchPanel';
import {
  CustomModelInput,
  FieldGroup,
  ModelSelectRow,
  STAGGER_CONTAINER_VARIANTS,
  STAGGER_ITEM_VARIANTS,
} from './settings/SettingsUI';

interface QuestionItemProps {
  question: GeneratedQuestion;
  index: number;
  results: MarkAnswerResponse | undefined;
  error: string | undefined;
  onRemove: (id: string) => void;
  onUpdate: (id: string, updates: Partial<GeneratedQuestion>) => void;
  onUpdateMapping: (index: number, range: string) => void;
  getPageRange: (index: number) => string;
}

const QuestionItem = ({
  question: q,
  index: qIdx,
  results,
  error,
  onRemove,
  onUpdate,
  onUpdateMapping,
  getPageRange,
}: QuestionItemProps) => {
  return (
    <motion.div
      layout
      variants={STAGGER_ITEM_VARIANTS}
      key={q.id}
      className={cn(
        'group p-4 border rounded-xl space-y-4 transition-all duration-300',
        results
          ? 'border-emerald-500/20 bg-emerald-500/5 shadow-[0_2px_12px_rgba(16,185,129,0.05)]'
          : 'border-border/40 bg-muted/20 hover:bg-muted/30 hover:border-border/80 shadow-sm',
      )}
    >
      <div className='flex items-center justify-between gap-3'>
        <div className='flex-1 flex items-center gap-2'>
          <span className='flex items-center justify-center w-6 h-6 rounded-md bg-foreground/5 text-[10px] font-bold font-mono text-muted-foreground border border-border/40'>
            {qIdx + 1}
          </span>
          <Input
            className='h-8 font-bold text-sm bg-transparent border-none focus-visible:ring-0 p-0 shadow-none selection:bg-primary/20'
            value={q.topic}
            onChange={(e) => onUpdate(q.id, { topic: e.target.value })}
            placeholder='Question Title'
          />
        </div>
        <Button
          size='icon'
          variant='ghost'
          className='h-7 w-7 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all active:scale-90'
          onClick={() => onRemove(q.id)}
        >
          <Trash2 className='w-3.5 h-3.5' />
        </Button>
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-1.5'>
          <Label className='text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-70 flex items-center gap-1.5'>
            Max Marks
          </Label>
          <Input
            type='number'
            className='h-9 bg-background/50 border-border/40 font-mono text-xs focus:ring-primary/30 transition-all'
            value={q.maxMarks}
            onChange={(e) =>
              onUpdate(q.id, {
                maxMarks: parseInt(e.target.value) || 0,
              })
            }
          />
        </div>
        <div className='space-y-1.5'>
          <Label className='text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-70'>
            Pages (e.g. 1, 3-5)
          </Label>
          <Input
            className='h-9 bg-background/50 border-border/40 font-mono text-xs focus:ring-primary/30 transition-all'
            placeholder='Page range...'
            defaultValue={getPageRange(qIdx)}
            onBlur={(e) => onUpdateMapping(qIdx, e.target.value)}
          />
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-70'>
          Reference Material / Question Text
        </Label>
        <textarea
          className='w-full min-h-20 p-3 text-xs leading-relaxed rounded-xl border border-border/40 bg-background/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-muted-foreground/50'
          placeholder='Paste question text or specific marking requirements here...'
          value={q.promptMarkdown}
          onChange={(e) =>
            onUpdate(q.id, {
              promptMarkdown: e.target.value,
            })
          }
        />
      </div>

      <AnimatePresence mode='wait'>
        {results && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className='pt-2'
          >
            <div className='p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-2 shadow-inner'>
              <div className='flex justify-between items-center'>
                <div className='flex items-center gap-2'>
                  <div className='flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white'>
                    <CheckCircle2 className='w-3 h-3' />
                  </div>
                  <span className='font-bold text-emerald-700 dark:text-emerald-400'>
                    Assessment Complete
                  </span>
                </div>
                <span className='font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'>
                  {results.achievedMarks} / {results.maxMarks}
                </span>
              </div>
              <p className='text-emerald-800/80 dark:text-emerald-300/70 leading-relaxed italic line-clamp-3'>
                "{results.feedbackMarkdown}"
              </p>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className='pt-2'
          >
            <div className='p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2 shadow-inner'>
              <AlertCircle className='w-3.5 h-3.5 mt-0.5 shrink-0' />
              <span className='font-medium leading-relaxed'>{error}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

interface MarkingSettingsProps {
  apiKey: string;
  markingModel: string;
  markerStyle: AppState['markerStyle'];
  customMarkerStyle: string;
  showCustomModel: boolean;
  customModelId: string;
  setMarkingModel: (v: string) => void;
  setMarkerStyle: (v: AppState['markerStyle']) => void;
  setCustomMarkerStyle: (v: string) => void;
  setCustomModelId: (v: string) => void;
  setShowCustomModel: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
}

const MarkingSettings = ({
  apiKey,
  markingModel,
  markerStyle,
  customMarkerStyle,
  showCustomModel,
  customModelId,
  setMarkingModel,
  setMarkerStyle,
  setCustomMarkerStyle,
  setCustomModelId,
  setShowCustomModel,
  setSearchOpen,
}: MarkingSettingsProps) => {
  return (
    <div className='p-4 space-y-4'>
      <FieldGroup label='Marking Model' htmlFor='pdf-model-select'>
        <ModelSelectRow
          id='pdf-model-select'
          value={markingModel}
          models={PRESET_MODELS}
          disabled={!apiKey}
          onSelect={(v) => {
            if (v === 'custom') {
              setShowCustomModel(true);
            } else {
              setShowCustomModel(false);
              setMarkingModel(v);
            }
          }}
          onSearch={() => setSearchOpen(true)}
        />
      </FieldGroup>

      <AnimatePresence>
        {showCustomModel && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className='overflow-hidden'
          >
            <CustomModelInput
              id='pdf-custom-model-id'
              label='Custom Model ID'
              value={customModelId}
              onChange={setCustomModelId}
              onApply={() => {
                setMarkingModel(customModelId.trim());
                setShowCustomModel(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className='space-y-3'>
        <Label className='text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-70'>
          Marking Strategy
        </Label>
        <div className='grid grid-cols-2 gap-2'>
          {MARKER_STYLE_OPTIONS.map((opt) => (
            <Button
              key={opt.id}
              variant={markerStyle === opt.id ? 'secondary' : 'ghost'}
              size='sm'
              className={cn(
                'h-9 text-xs justify-start px-3 gap-2 transition-all active:scale-95',
                markerStyle === opt.id
                  ? 'bg-primary/10 text-primary hover:bg-primary/20'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() =>
                setMarkerStyle(
                  opt.id as 'strict' | 'relaxed' | 'targeted' | 'custom',
                )
              }
            >
              <div
                className={cn(
                  'w-1 h-1 rounded-full transition-colors',
                  markerStyle === opt.id
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30',
                )}
              />
              {opt.name}
            </Button>
          ))}
        </div>
      </div>

      {markerStyle === 'custom' && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className='space-y-2'
        >
          <Label className='text-[10px] uppercase font-bold tracking-wider text-muted-foreground opacity-70'>
            Custom Strategy Directives
          </Label>
          <textarea
            value={customMarkerStyle}
            onChange={(e) => setCustomMarkerStyle(e.target.value)}
            placeholder='e.g. Be extremely pedantic about units, award zero marks for missing working...'
            className='w-full min-h-20 p-3 text-xs leading-relaxed rounded-xl border border-border/40 bg-background/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all shadow-inner'
          />
        </motion.div>
      )}
    </div>
  );
};

export function PDFMarkerView() {
  const navigate = useNavigate();
  const {
    apiKey,
    markingModel,
    markerStyle,
    customMarkerStyle,
    setMarkingModel,
    setMarkerStyle,
    setCustomMarkerStyle,
    pdfMarkerPdfBase64,
    pdfMarkerQuestions,
    pdfMarkerPageMapping,
    pdfMarkerResultsByQuestionId,
    pdfMarkerErrorsByQuestionId,
    isPdfMarkerMarking,
    isPdfMarkerDiscovering,
    setPdfMarkerPdfBase64,
    setPdfMarkerQuestions,
    setPdfMarkerPageMapping,
    markPdf,
    discoverPdfQuestions,
    resetPdfMarker,
  } = useAppStore();

  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCustomModel, setShowCustomModel] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const hasResults = useMemo(
    () => Object.keys(pdfMarkerResultsByQuestionId).length > 0,
    [pdfMarkerResultsByQuestionId],
  );

  useEffect(() => {
    if (!isPdfMarkerMarking && hasResults) {
      void navigate('/pdf-marker/results');
    }
  }, [isPdfMarkerMarking, hasResults, navigate]);

  const handlePdfDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;

      setIsLoadingPdf(true);
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setPdfMarkerPdfBase64(base64);
          toast.success('PDF uploaded successfully');
          setIsLoadingPdf(false);
        };
        reader.onerror = () => {
          toast.error('Failed to read PDF');
          setIsLoadingPdf(false);
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error loading PDF:', error);
        toast.error('Failed to load PDF');
        setIsLoadingPdf(false);
      }
    },
    [setPdfMarkerPdfBase64],
  );

  const addQuestion = () => {
    const newQuestion = {
      id: crypto.randomUUID(),
      topic: `Question ${pdfMarkerQuestions.length + 1}`,
      subtopic: '',
      maxMarks: 5,
      promptMarkdown: '',
      techAllowed: true,
    };
    setPdfMarkerQuestions([...pdfMarkerQuestions, newQuestion]);
  };

  const removeQuestion = (id: string) => {
    const indexToRemove = pdfMarkerQuestions.findIndex((q) => q.id === id);
    if (indexToRemove === -1) return;

    setPdfMarkerQuestions(pdfMarkerQuestions.filter((q) => q.id !== id));

    // Update mapping: remove the question's mapping and shift others
    const newMapping = pdfMarkerPageMapping
      .filter((m) => m.questionIndex !== indexToRemove)
      .map((m) => {
        if (m.questionIndex > indexToRemove) {
          return { ...m, questionIndex: m.questionIndex - 1 };
        }
        return m;
      });
    setPdfMarkerPageMapping(newMapping);
  };

  const updateQuestion = (
    id: string,
    updates: Partial<(typeof pdfMarkerQuestions)[0]>,
  ) => {
    setPdfMarkerQuestions(
      pdfMarkerQuestions.map((q) => (q.id === id ? { ...q, ...updates } : q)),
    );
  };

  const updatePageMapping = (questionIndex: number, pageRangeStr: string) => {
    // Parse range string like "1, 2, 4-6"
    const indices: number[] = [];
    const parts = pageRangeStr.split(',').map((p) => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map((n) => parseInt(n.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = Math.min(start, end); i <= Math.max(start, end); i++) {
            indices.push(i - 1); // 1-indexed to 0-indexed
          }
        }
      } else {
        const n = parseInt(part);
        if (!isNaN(n)) {
          indices.push(n - 1);
        }
      }
    }

    const uniqueIndices = Array.from(new Set(indices)).sort((a, b) => a - b);

    const existingIdx = pdfMarkerPageMapping.findIndex(
      (m) => m.questionIndex === questionIndex,
    );

    if (existingIdx !== -1) {
      const newMapping = [...pdfMarkerPageMapping];
      newMapping[existingIdx] = { questionIndex, pageIndices: uniqueIndices };
      setPdfMarkerPageMapping(newMapping);
    } else {
      setPdfMarkerPageMapping([
        ...pdfMarkerPageMapping,
        { questionIndex, pageIndices: uniqueIndices },
      ]);
    }
  };

  const getPageRangeStr = (questionIndex: number) => {
    const mapping = pdfMarkerPageMapping.find(
      (m) => m.questionIndex === questionIndex,
    );
    if (!mapping || mapping.pageIndices.length === 0) return '';

    const sorted = [...mapping.pageIndices].sort((a, b) => a - b);
    const result: string[] = [];
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        if (start === end) {
          result.push((start + 1).toString());
        } else {
          result.push(`${start + 1}-${end + 1}`);
        }
        if (i < sorted.length) {
          start = sorted[i];
          end = sorted[i];
        }
      }
    }

    return result.join(', ');
  };

  return (
    <TooltipProvider>
      <div className='flex h-full gap-4 p-6 overflow-hidden bg-background'>
        {searchOpen && (
          <ModelSearchPanel
            target='marking'
            apiKey={apiKey}
            onClose={() => setSearchOpen(false)}
            onSelect={(id) => {
              setMarkingModel(id);
              setShowCustomModel(false);
              setSearchOpen(false);
            }}
          />
        )}
        {/* Left Panel: Questions and Mapping */}
        <div className='w-1/3 flex flex-col gap-4 min-w-100'>
          <Card className='flex-1 overflow-hidden flex flex-col shadow-xl border-border/40 bg-card/50 backdrop-blur-md'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0'>
              <CardTitle className='text-lg font-bold tracking-tight'>
                Questions
              </CardTitle>
              <div className='flex items-center gap-1'>
                {hasResults && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size='icon'
                        variant='ghost'
                        onClick={() => void navigate('/pdf-marker/results')}
                        className='h-8 w-8 text-primary hover:bg-primary/10 transition-all active:scale-90'
                      >
                        <BarChart className='w-4 h-4' />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View Results</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size='icon'
                      variant='ghost'
                      onClick={() => void navigate('/pdf-marker/history')}
                      className='h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all active:scale-90'
                    >
                      <History className='w-4 h-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>History</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size='icon'
                      variant={showSettings ? 'secondary' : 'ghost'}
                      onClick={() => setShowSettings(!showSettings)}
                      className='h-8 w-8 transition-all active:scale-90'
                    >
                      <Settings
                        className={cn(
                          'w-4 h-4 transition-transform duration-300',
                          showSettings && 'rotate-90',
                        )}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Settings</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size='icon'
                      variant='ghost'
                      disabled={!pdfMarkerPdfBase64 || isPdfMarkerDiscovering}
                      onClick={() => void discoverPdfQuestions()}
                      className='h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all active:scale-90'
                    >
                      {isPdfMarkerDiscovering ? (
                        <div className='w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin' />
                      ) : (
                        <Sparkles className='w-4 h-4' />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Auto-discover Questions</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size='icon'
                      variant='ghost'
                      onClick={addQuestion}
                      className='h-8 w-8 hover:bg-primary/10 hover:text-primary transition-all active:scale-90'
                    >
                      <Plus className='w-4 h-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Add Question</TooltipContent>
                </Tooltip>

                <Separator orientation='vertical' className='h-4 mx-1' />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size='icon'
                      variant='ghost'
                      onClick={resetPdfMarker}
                      className='h-8 w-8 hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90'
                    >
                      <RefreshCcw className='w-4 h-4' />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset All</TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
            <Separator />

            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className='overflow-hidden border-b bg-muted/10'
                >
                  <MarkingSettings
                    apiKey={apiKey}
                    markingModel={markingModel}
                    markerStyle={markerStyle}
                    customMarkerStyle={customMarkerStyle}
                    showCustomModel={showCustomModel}
                    customModelId={customModelId}
                    setMarkingModel={setMarkingModel}
                    setMarkerStyle={setMarkerStyle}
                    setCustomMarkerStyle={setCustomMarkerStyle}
                    setCustomModelId={setCustomModelId}
                    setShowCustomModel={setShowCustomModel}
                    setSearchOpen={setSearchOpen}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <CardContent className='flex-1 overflow-auto p-4 space-y-4'>
              {pdfMarkerQuestions.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-12 text-center space-y-3'>
                  <div className='w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center text-muted-foreground/50'>
                    <FileText className='w-6 h-6' />
                  </div>
                  <div className='max-w-60'>
                    <p className='text-sm font-medium text-foreground/80'>
                      No questions yet
                    </p>
                    <p className='text-xs text-muted-foreground mt-1'>
                      Add questions manually or use Auto-discover to extract
                      them from the PDF.
                    </p>
                  </div>
                </div>
              ) : (
                <motion.div
                  variants={STAGGER_CONTAINER_VARIANTS}
                  initial='hidden'
                  animate='visible'
                  className='space-y-4'
                >
                  <LayoutGroup>
                    {pdfMarkerQuestions.map((q, qIdx) => (
                      <QuestionItem
                        key={q.id}
                        question={q}
                        index={qIdx}
                        results={pdfMarkerResultsByQuestionId[q.id]}
                        error={pdfMarkerErrorsByQuestionId[q.id]}
                        onRemove={removeQuestion}
                        onUpdate={updateQuestion}
                        onUpdateMapping={updatePageMapping}
                        getPageRange={getPageRangeStr}
                      />
                    ))}
                  </LayoutGroup>
                </motion.div>
              )}
            </CardContent>

            <div className='p-4 border-t bg-muted/20 backdrop-blur-md'>
              <Button
                className={cn(
                  'w-full h-11 text-sm font-semibold tracking-tight transition-all active:scale-[0.98]',
                  isPdfMarkerMarking
                    ? 'opacity-90'
                    : 'hover:shadow-md hover:shadow-primary/10',
                )}
                disabled={
                  isPdfMarkerMarking ||
                  pdfMarkerQuestions.length === 0 ||
                  !pdfMarkerPdfBase64
                }
                onClick={() => {
                  void markPdf();
                }}
              >
                {isPdfMarkerMarking ? (
                  <div className='flex items-center gap-3'>
                    <div className='w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin' />
                    <span>Processing Assessment...</span>
                  </div>
                ) : (
                  <div className='flex items-center gap-2'>
                    <Play className='w-4 h-4 fill-current' />
                    <span>Mark All Questions</span>
                  </div>
                )}
              </Button>
              {!pdfMarkerPdfBase64 && (
                <p className='text-[10px] text-center mt-3 text-muted-foreground font-medium uppercase tracking-tighter'>
                  Please upload a PDF to begin marking
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right Panel: PDF Preview */}
        <div className='flex-1 flex flex-col gap-4 min-w-0'>
          <Card className='flex-1 flex flex-col overflow-hidden shadow-2xl border-border/40 bg-card/30 backdrop-blur-sm relative'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0'>
              <CardTitle className='text-lg font-bold tracking-tight'>
                PDF Preview
              </CardTitle>
              {pdfMarkerPdfBase64 && (
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => setPdfMarkerPdfBase64(null)}
                  className='h-8 px-3 text-xs font-medium hover:bg-destructive/10 hover:text-destructive transition-all active:scale-95'
                >
                  Change PDF
                </Button>
              )}
            </CardHeader>
            <Separator />
            <CardContent className='flex-1 overflow-hidden p-0 flex flex-col relative'>
              {!pdfMarkerPdfBase64 ? (
                <div className='flex-1 flex flex-col items-center justify-center p-8 relative'>
                  {/* Background Pattern */}
                  <div
                    className='absolute inset-0 opacity-[0.03] pointer-events-none'
                    style={{
                      backgroundImage: `radial-gradient(circle at 2px 2px, var(--foreground) 1px, transparent 0)`,
                      backgroundSize: '24px 24px',
                    }}
                  />

                  {isLoadingPdf ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className='flex flex-col items-center gap-4 z-10'
                    >
                      <div className='relative w-16 h-16'>
                        <div className='absolute inset-0 border-4 border-primary/20 rounded-full' />
                        <div className='absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin' />
                      </div>
                      <div className='text-center'>
                        <p className='text-sm font-bold text-foreground'>
                          Analyzing Document
                        </p>
                        <p className='text-xs text-muted-foreground mt-1'>
                          Preparing secure preview environment...
                        </p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className='w-full max-w-lg z-10'
                    >
                      <Dropzone
                        onDrop={(files) => {
                          void handlePdfDrop(files);
                        }}
                        accept={{ 'application/pdf': [] }}
                        className='border-2 border-dashed border-border/60 bg-background/50 hover:bg-primary/5 hover:border-primary/40 transition-all duration-300 rounded-3xl p-12'
                      />
                    </motion.div>
                  )}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className='w-full h-full bg-muted/20'
                >
                  <iframe
                    src={`${pdfMarkerPdfBase64}#toolbar=0&navpanes=0`}
                    className='w-full h-full border-none filter contrast-[1.02]'
                    title='PDF Preview'
                  />
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </TooltipProvider>
  );
}
