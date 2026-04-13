import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Brain,
  Check,
  Copy,
  Download,
  Loader2,
  Maximize2,
  Minimize2,
  PencilRuler,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { useAppSettings } from '@/AppContext';
import { MarkdownMath } from '@/components/MarkdownMath';
import {
  CANVAS_STORAGE_KEY_PREFIX,
  getCropBoundingBox,
  INTERNAL_RES_HEIGHT,
  INTERNAL_RES_WIDTH,
} from '@/components/sketchpadUtils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  parseStrokesFromSvgString,
  rasterizeSvgString,
} from '@/lib/sketchpad-renderer';
import { cn } from '@/lib/utils';
import { useTutorStore } from '@/store/tutor';
import type { StudentAnswerImage } from '@/types';
import { PRESET_IMAGE_MODELS, PRESET_MODELS } from '@/views/settings/constants';

interface TutorPanelProps {
  questionId: string;
  contextPrompt: string;
  studentAnswer?: string;
  image?: StudentAnswerImage;
  sketchSessionKey?: string;
  className?: string;
}

interface TutorChatResponse {
  content: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  estimated_cost_usd?: number;
}

type TutorApiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type TutorApiMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | TutorApiContentPart[];
};

async function getSketchpadDataUrl(
  sketchSessionKey?: string,
): Promise<string | undefined> {
  if (!sketchSessionKey) return undefined;
  if (typeof window === 'undefined' || !window.localStorage) return undefined;

  try {
    const storedValue = window.localStorage.getItem(
      `${CANVAS_STORAGE_KEY_PREFIX}-${sketchSessionKey}`,
    );
    if (!storedValue) return undefined;

    const parsed = JSON.parse(storedValue) as { strokeSvg?: unknown };
    if (typeof parsed.strokeSvg !== 'string' || !parsed.strokeSvg.trim()) {
      return undefined;
    }

    const strokes = parseStrokesFromSvgString(parsed.strokeSvg);
    if (!strokes.length) return undefined;

    const canvas = await rasterizeSvgString(
      parsed.strokeSvg,
      INTERNAL_RES_WIDTH,
      INTERNAL_RES_HEIGHT,
    );

    const cropBox = getCropBoundingBox(canvas, 30);
    if (!cropBox) return undefined;

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = cropBox.width;
    croppedCanvas.height = cropBox.height;
    const ctx = croppedCanvas.getContext('2d');
    if (!ctx) return undefined;

    // Fill with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cropBox.width, cropBox.height);

    ctx.drawImage(
      canvas,
      cropBox.x,
      cropBox.y,
      cropBox.width,
      cropBox.height,
      0,
      0,
      cropBox.width,
      cropBox.height,
    );

    return croppedCanvas.toDataURL('image/png', 0.85);
  } catch {
    return undefined;
  }
}

const TutorHeader = ({
  modelName,
  totalTokensSession,
  totalCostSession,
  activeModel,
  activePersona,
  questionId,
  isCompact,
  setIsOpen,
  toggleCompact,
  updateSessionOverrides,
  clearSession,
  handleExportTranscript,
}: {
  modelName: string;
  totalTokensSession: number;
  totalCostSession: number;
  activeModel: string;
  activePersona: string;
  questionId: string;
  isCompact: boolean;
  setIsOpen: (open: boolean) => void;
  toggleCompact: () => void;
  updateSessionOverrides: (
    qid: string,
    overrides: { model?: string; persona?: string },
  ) => void;
  clearSession: (qid: string) => void;
  handleExportTranscript: () => void;
}) => (
  <div className='flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30 backdrop-blur-sm'>
    <div className='flex items-center gap-2'>
      <div className='bg-primary/10 p-1.5 rounded-lg'>
        <Sparkles className='h-4 w-4 text-primary' />
      </div>
      <div>
        <h3 className='font-bold text-sm flex items-center gap-1.5'>
          AI Tutor
          <Popover>
            <PopoverTrigger asChild>
              <button className='text-[10px] font-medium text-muted-foreground px-1.5 py-0.5 bg-muted rounded border border-border/50 hover:bg-muted/80 transition-colors'>
                {modelName || 'Select Model'}
              </button>
            </PopoverTrigger>
            <PopoverContent className='w-64 p-3' align='start'>
              <div className='space-y-3'>
                <div className='space-y-1.5'>
                  <Label className='text-[10px] uppercase tracking-wider text-muted-foreground'>
                    Session Model
                  </Label>
                  <Select
                    value={activeModel}
                    onValueChange={(val) => {
                      updateSessionOverrides(questionId, {
                        model: val,
                      });
                    }}
                  >
                    <SelectTrigger className='h-8 text-xs'>
                      <SelectValue placeholder='Select model' />
                    </SelectTrigger>
                    <SelectContent>
                      {[...PRESET_MODELS, ...PRESET_IMAGE_MODELS]
                        .filter(
                          (m, i, self) =>
                            self.findIndex((t) => t.id === m.id) === i,
                        )
                        .map((m) => (
                          <SelectItem
                            key={m.id}
                            value={m.id}
                            className='text-xs'
                          >
                            {m.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-1.5'>
                  <Label className='text-[10px] uppercase tracking-wider text-muted-foreground'>
                    Session Persona
                  </Label>
                  <Textarea
                    value={activePersona}
                    onChange={(e) => {
                      updateSessionOverrides(questionId, {
                        persona: e.target.value,
                      });
                    }}
                    placeholder='Custom tutor instructions...'
                    className='text-[11px] min-h-20 resize-none'
                  />
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full h-7 text-[10px]'
                    onClick={() => {
                      clearSession(questionId);
                    }}
                  >
                    <Trash2 className='h-3 w-3 mr-1.5' />
                    Reset Session
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </h3>
        <p className='text-[10px] text-muted-foreground font-medium'>
          {totalTokensSession > 0
            ? `${totalTokensSession.toLocaleString()} tokens (~$${totalCostSession.toFixed(4)})`
            : 'Always here to help'}
        </p>
      </div>
    </div>
    <div className='flex items-center gap-1'>
      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8 rounded-full hover:bg-muted'
        onClick={() => {
          toggleCompact();
        }}
        title={
          isCompact ? 'Large Mode (Cmd+Shift+M)' : 'Compact Mode (Cmd+Shift+M)'
        }
      >
        {isCompact ? (
          <Maximize2 className='h-4 w-4' />
        ) : (
          <Minimize2 className='h-4 w-4' />
        )}
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8 rounded-full hover:bg-muted'
        onClick={() => {
          handleExportTranscript();
        }}
        title='Export Transcript'
      >
        <Download className='h-4 w-4' />
      </Button>
      <Button
        variant='ghost'
        size='icon'
        className='h-8 w-8 rounded-full hover:bg-muted'
        onClick={() => {
          setIsOpen(false);
        }}
      >
        <X className='h-4 w-4' />
      </Button>
    </div>
  </div>
);

const MessageItem = ({
  msg,
  copiedId,
  handleCopyMessage,
}: {
  msg: { id: string; role: string; content: string };
  copiedId: string | null;
  handleCopyMessage: (id: string, content: string) => void;
}) => (
  <div
    className={cn(
      'flex flex-col max-w-[85%] space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300 group relative',
      msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
    )}
  >
    <div
      className={cn(
        'px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm',
        msg.role === 'user'
          ? 'bg-primary text-primary-foreground rounded-tr-none'
          : 'bg-card text-foreground rounded-tl-none border border-border/50',
      )}
    >
      <div
        className={cn(
          msg.role === 'user'
            ? 'text-primary-foreground [&_.math-inline]:text-primary-foreground [&_.math-display]:text-primary-foreground'
            : '',
        )}
      >
        <MarkdownMath content={msg.content} />
      </div>

      {msg.role === 'assistant' && (
        <button
          onClick={() => handleCopyMessage(msg.id, msg.content)}
          className='absolute -right-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded-md text-muted-foreground'
          title='Copy message'
        >
          {copiedId === msg.id ? (
            <Check className='h-3.5 w-3.5 text-green-500' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
        </button>
      )}
    </div>
  </div>
);

export function TutorPanel({
  questionId,
  contextPrompt,
  studentAnswer,
  image,
  sketchSessionKey,
  className,
}: TutorPanelProps) {
  const {
    isOpen,
    setIsOpen,
    toggleOpen,
    isCompact,
    toggleCompact,
    sessions,
    addMessage,
    updateSessionOverrides,
    clearSession,
    isGenerating,
    setIsGenerating,
    streamedContent,
    setStreamedContent,
    appendStreamedContent,
    totalTokensSession,
    totalCostSession,
    updateMetrics,
    incrementErrorCount,
  } = useTutorStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      setIsOpen: s.setIsOpen,
      toggleOpen: s.toggleOpen,
      isCompact: s.isCompact,
      toggleCompact: s.toggleCompact,
      sessions: s.sessions,
      addMessage: s.addMessage,
      updateSessionOverrides: s.updateSessionOverrides,
      clearSession: s.clearSession,
      isGenerating: s.isGenerating,
      setIsGenerating: s.setIsGenerating,
      streamedContent: s.streamedContent,
      setStreamedContent: s.setStreamedContent,
      appendStreamedContent: s.appendStreamedContent,
      totalTokensSession: s.totalTokensSession,
      totalCostSession: s.totalCostSession,
      updateMetrics: s.updateMetrics,
      incrementErrorCount: s.incrementErrorCount,
    })),
  );

  const { apiKey, tutorModel, tutorPersona } = useAppSettings();
  const [inputValue, setInputValue] = useState('');
  const [includeSketch, setIncludeSketch] = useState(false);
  const [sketchStatus, setSketchStatus] = useState<
    'idle' | 'processing' | 'sending' | 'none'
  >('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const session = sessions[questionId];
  const messages = useMemo(() => session?.messages || [], [session]);

  // Current model/persona (with session-specific overrides)
  const activeModel = session?.modelOverride || tutorModel;
  const activePersona = session?.personaOverride || tutorPersona;

  // Helper to get friendly model name
  const modelName = useMemo(() => {
    if (!activeModel) return '';
    const preset = [...PRESET_MODELS, ...PRESET_IMAGE_MODELS].find(
      (m) => m.id === activeModel,
    );
    if (preset) return preset.name;
    return activeModel.split('/').pop() || activeModel;
  }, [activeModel]);

  // Keyboard shortcuts (Cmd+Shift+T to toggle, Cmd+Shift+M for compact)
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
        if (e.key.toLowerCase() === 't') {
          e.preventDefault();
          toggleOpen();
        } else if (e.key.toLowerCase() === 'm') {
          e.preventDefault();
          toggleCompact();
        }
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyMessage = (id: string, content: string) => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(content);
        setCopiedId(id);
        toast.success('Message copied to clipboard');
        setTimeout(() => setCopiedId(null), 2000);
      } catch (error) {
        console.error('Failed to copy message:', error);
        toast.error('Failed to copy message');
      }
    })();
  };

  const handleExportTranscript = () => {
    void (async () => {
      if (!messages.length) return;

      try {
        const transcript = messages
          .map(
            (m) =>
              `### ${m.role === 'user' ? 'Student' : 'Tutor'} (${new Date(m.createdAt).toLocaleString()})\n\n${m.content}\n\n---`,
          )
          .join('\n\n');

        const filePath = await save({
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          defaultPath: `tutor-transcript-${questionId}.md`,
        });

        if (filePath) {
          await invoke('write_text_file', {
            path: filePath,
            content: transcript,
          });
          toast.success('Transcript exported successfully');
        }
      } catch (error) {
        console.error('Failed to export transcript:', error);
        toast.error('Failed to export transcript');
      }
    })();
  };

  // Scroll to bottom when messages or stream changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedContent]);

  // Setup SSE listener for streaming tokens
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    listen<{ text: string }>('tutor-generation-token', (event) => {
      appendStreamedContent(event.payload.text);
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [appendStreamedContent]);

  // Listen for sketchpad changes
  useEffect(() => {
    if (!sketchSessionKey) return;

    // Initial check from localStorage
    try {
      const storedValue = window.localStorage.getItem(
        `${CANVAS_STORAGE_KEY_PREFIX}-${sketchSessionKey}`,
      );
      if (storedValue) {
        const parsed = JSON.parse(storedValue) as { strokeSvg?: unknown };
        if (typeof parsed.strokeSvg === 'string' && parsed.strokeSvg.trim()) {
          const strokes = parseStrokesFromSvgString(parsed.strokeSvg);
          setIncludeSketch(strokes.length > 0);
        }
      }
    } catch {
      // ignore
    }

    const handleSketchpadSaved = (e: Event) => {
      const customEvent = e as CustomEvent<{
        sessionKey: string;
        hasStrokes: boolean;
      }>;
      if (customEvent.detail.sessionKey === sketchSessionKey) {
        setIncludeSketch(customEvent.detail.hasStrokes);
      }
    };

    window.addEventListener('sketchpad-saved', handleSketchpadSaved);
    return () => {
      window.removeEventListener('sketchpad-saved', handleSketchpadSaved);
    };
  }, [sketchSessionKey]);

  // eslint-disable-next-line complexity
  const handleSend = async (overrideValue?: string, isDiagnostic = false) => {
    const finalInputValue = overrideValue ?? inputValue;
    if (!finalInputValue.trim() || isGenerating) return;

    const userMessageContent = finalInputValue;
    if (!overrideValue) setInputValue('');

    // Add user message to store
    addMessage(questionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessageContent,
      createdAt: Date.now(),
    });

    setIsGenerating(true);
    setStreamedContent('');

    try {
      console.log(`[Tutor] Starting chat with model: ${activeModel}`);

      setSketchStatus('processing');
      if (includeSketch) {
        window.dispatchEvent(new CustomEvent('tutor-request-sketch-save'));
        // Slight delay to allow synchronous localstorage save
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const sketchpadDataUrl = includeSketch
        ? await getSketchpadDataUrl(sketchSessionKey)
        : undefined;

      if (sketchpadDataUrl) {
        setSketchStatus('sending');
      } else {
        setSketchStatus('none');
      }

      // Build full conversation history for the API
      const apiMessages: TutorApiMessage[] = [];

      const basePersona =
        activePersona ||
        'You are a helpful VCE tutor. Guide the student step-by-step using the Socratic method. Do not give away the final answer immediately.';
      const formattingInstructions =
        '\n\nIMPORTANT FORMATTING RULES:\n- Format math expressions using LaTeX.\n- Use single $...$ delimiters for inline math (e.g., $x^2 + y^2 = r^2$).\n- Use double $$...$$ delimiters for block/display math.\n- Format your response using Markdown (bold, italic, bullet points, etc.).';

      // 1. Combined System Message (Persona + Formatting + Question Context)
      let systemContent = basePersona + formattingInstructions;
      systemContent += `\n\n--- QUESTION CONTEXT ---\n${contextPrompt}`;
      if (studentAnswer) {
        systemContent += `\n\n--- STUDENT'S WRITTEN ANSWER ---\n${studentAnswer}`;
      }
      if (image?.dataUrl || sketchpadDataUrl) {
        systemContent +=
          '\n\n--- VISUAL CONTEXT ---\nThe student has provided images/sketches. Use these to understand their working and provide targeted feedback.';
      }

      if (isDiagnostic) {
        systemContent +=
          '\n\n--- DIAGNOSTIC MODE ---\nThe student is requesting an error diagnosis. Carefully analyze their working and specifically point out where they might have gone wrong, but still try to guide them rather than just giving the fix.';
      }

      apiMessages.push({
        role: 'system',
        content: systemContent,
      });

      // 2. Conversation History
      messages.forEach((m) => {
        apiMessages.push({
          role: m.role,
          content: m.content,
        });
      });

      // 3. New User Message with Images
      const userContentParts: TutorApiContentPart[] = [
        { type: 'text', text: userMessageContent },
      ];

      if (image?.dataUrl) {
        userContentParts.push({
          type: 'image_url',
          image_url: { url: image.dataUrl },
        });
      }

      if (sketchpadDataUrl) {
        userContentParts.push({
          type: 'image_url',
          image_url: { url: sketchpadDataUrl },
        });
      }

      apiMessages.push({
        role: 'user',
        content: userContentParts,
      });

      // Call backend
      const result = await invoke<TutorChatResponse>('tutor_chat', {
        request: {
          messages: apiMessages,
          model: activeModel,
          apiKey: apiKey,
          diagnostic: isDiagnostic,
        },
      });

      // Add assistant message to store
      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        createdAt: Date.now(),
      });

      // Update metrics
      const promptTokens = Number(result.promptTokens ?? result.prompt_tokens);
      const completionTokens = Number(
        result.completionTokens ?? result.completion_tokens,
      );
      const directTotalTokens = Number(
        result.totalTokens ?? result.total_tokens,
      );
      const fallbackTotalTokens =
        (Number.isFinite(promptTokens) ? promptTokens : 0) +
        (Number.isFinite(completionTokens) ? completionTokens : 0);
      const totalTokens = Number.isFinite(directTotalTokens)
        ? directTotalTokens
        : fallbackTotalTokens;

      const directCost = Number(
        result.estimatedCostUsd ?? result.estimated_cost_usd,
      );
      const cost = Number.isFinite(directCost)
        ? directCost
        : totalTokens * 0.000005;

      updateMetrics(totalTokens, cost);
      console.log(`[Tutor] Success. Tokens: ${totalTokens}, Cost: $${cost}`);
    } catch (error) {
      console.error('Tutor chat error:', error);
      incrementErrorCount();
      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'Sorry, I encountered an error connecting to the tutor service.',
        createdAt: Date.now(),
      });
    } finally {
      setIsGenerating(false);
      setSketchStatus('idle');
      setStreamedContent('');
      setIncludeSketch(false);
    }
  };

  const handleDiagnosticRequest = () => {
    void handleSend(
      'Please check my work and let me know if I made any errors.',
      true,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 flex flex-col items-start pointer-events-none',
        className,
      )}
    >
      <AnimatePresence mode='wait'>
        {!isOpen ? (
          <motion.div
            key='tutor-toggle'
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2 }}
            className='pointer-events-auto'
          >
            <Button
              onClick={() => setIsOpen(true)}
              size='icon'
              className='h-12 w-12 rounded-full shadow-2xl bg-primary hover:bg-primary/90 transition-all duration-300 hover:scale-105 active:scale-95 group'
            >
              <Brain className='h-6 w-6 text-primary-foreground group-hover:rotate-12 transition-transform duration-300' />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key='tutor-panel'
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              'pointer-events-auto flex flex-col bg-card border border-border rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden transition-all duration-300',
              isCompact
                ? 'w-72 h-[clamp(15rem,50dvh,25rem)]'
                : 'w-[min(24rem,calc(100vw-2rem))] sm:w-96 h-[clamp(20rem,68dvh,37.5rem)] max-h-[calc(100dvh-4.5rem)]',
            )}
          >
            <TutorHeader
              modelName={modelName}
              totalTokensSession={totalTokensSession}
              totalCostSession={totalCostSession}
              activeModel={activeModel}
              activePersona={activePersona}
              questionId={questionId}
              isCompact={isCompact}
              setIsOpen={setIsOpen}
              toggleCompact={toggleCompact}
              updateSessionOverrides={updateSessionOverrides}
              clearSession={clearSession}
              handleExportTranscript={handleExportTranscript}
            />

            {/* Chat Area */}
            <ScrollArea className='flex-1 min-h-0 p-4 bg-muted/5'>
              <div className='space-y-4'>
                {messages.length === 0 && !isGenerating && (
                  <div className='flex flex-col items-center justify-center text-center mt-6 sm:mt-12 space-y-3 px-6'>
                    <div className='bg-primary/5 p-3 rounded-full'>
                      <Brain className='h-8 w-8 text-primary/40' />
                    </div>
                    <div className='space-y-1'>
                      <p className='text-xs font-semibold'>Ask for guidance</p>
                      <p className='text-[11px] text-muted-foreground leading-relaxed'>
                        I can provide hints, check your working, or explain the
                        core concepts of this question.
                      </p>
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <MessageItem
                    key={msg.id}
                    msg={msg}
                    copiedId={copiedId}
                    handleCopyMessage={handleCopyMessage}
                  />
                ))}

                {/* Streaming chunk */}
                {isGenerating && (
                  <div className='flex flex-col max-w-[85%] mr-auto items-start space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300'>
                    <div className='px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed bg-card text-foreground rounded-tl-none border border-border/50 shadow-sm min-w-15'>
                      {streamedContent ? (
                        <MarkdownMath content={streamedContent} />
                      ) : (
                        <div className='flex gap-1 py-1'>
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{
                              repeat: Infinity,
                              duration: 1,
                              times: [0, 0.5, 1],
                            }}
                            className='h-1.5 w-1.5 bg-primary/40 rounded-full'
                          />
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{
                              repeat: Infinity,
                              duration: 1,
                              delay: 0.2,
                              times: [0, 0.5, 1],
                            }}
                            className='h-1.5 w-1.5 bg-primary/40 rounded-full'
                          />
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{
                              repeat: Infinity,
                              duration: 1,
                              delay: 0.4,
                              times: [0, 0.5, 1],
                            }}
                            className='h-1.5 w-1.5 bg-primary/40 rounded-full'
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className='p-4 border-t border-border bg-card'>
              <div className='flex items-center justify-between mb-3 px-1'>
                {sketchSessionKey && (
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='include-sketch'
                      checked={includeSketch}
                      onCheckedChange={(checked) =>
                        setIncludeSketch(checked === true)
                      }
                    />
                    <Label
                      htmlFor='include-sketch'
                      className='text-[11px] text-muted-foreground font-medium cursor-pointer'
                    >
                      Include Sketchpad
                    </Label>
                  </div>
                )}
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={handleDiagnosticRequest}
                  disabled={isGenerating}
                  className='h-6 px-2 text-[10px] text-primary/70 hover:text-primary hover:bg-primary/5 flex items-center gap-1.5'
                >
                  <Activity className='h-3 w-3' />
                  Check my work
                </Button>
              </div>
              <AnimatePresence>
                {sketchStatus !== 'idle' && sketchStatus !== 'none' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className='flex items-center gap-2 mb-2 px-1 text-[10px] text-muted-foreground overflow-hidden'
                  >
                    {sketchStatus === 'processing' ? (
                      <>
                        <Loader2 className='h-3 w-3 animate-spin text-primary/60' />
                        <span>Rasterizing sketchpad...</span>
                      </>
                    ) : (
                      <>
                        <PencilRuler className='h-3 w-3 text-primary/60' />
                        <span>Uploading sketchpad content...</span>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className='relative flex items-end gap-2'>
                <Textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='Ask for a hint...'
                  className='min-h-11 max-h-30 pr-12 resize-none py-3 px-4 text-xs rounded-xl bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/20'
                  disabled={isGenerating}
                />
                <Button
                  size='icon'
                  className='absolute right-1.5 bottom-1.5 h-8 w-8 rounded-lg transition-all duration-200'
                  onClick={() => void handleSend()}
                  disabled={!inputValue.trim() || isGenerating}
                >
                  <Send className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
