import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Brain,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Download,
  Eraser,
  FileText,
  Info,
  Loader2,
  Maximize2,
  Minimize2,
  PencilRuler,
  RefreshCcw,
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
  studentAnswer,
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
  studentAnswer?: string;
}) => (
  <div
    className={cn(
      'flex items-center justify-between border-b border-border bg-muted/30 backdrop-blur-sm shrink-0',
      isCompact ? 'px-3 py-1.5' : 'px-4 py-2.5',
    )}
  >
    <div className='flex items-center gap-2'>
      {!isCompact && (
        <div className='bg-primary/10 p-1.5 rounded-lg'>
          <Sparkles className='h-4 w-4 text-primary' />
        </div>
      )}
      <div className='min-w-0'>
        <h3 className='font-bold text-sm flex items-center gap-1.5 truncate'>
          {!isCompact && 'AI Tutor'}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'font-medium text-muted-foreground bg-muted rounded border border-border/50 hover:bg-muted/80 transition-colors truncate',
                  isCompact ? 'text-[9px] px-1 py-0' : 'text-[10px] px-1.5 py-0.5',
                )}
              >
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
        {!isCompact && (
          <div className='flex items-center gap-2'>
            <p className='text-[10px] text-muted-foreground font-medium'>
              {totalTokensSession > 0
                ? `${totalTokensSession.toLocaleString()} tokens (~$${totalCostSession.toFixed(4)})`
                : 'Always here to help'}
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <button className='text-muted-foreground hover:text-primary transition-colors'>
                  <Info className='h-3 w-3' />
                </button>
              </PopoverTrigger>
              <PopoverContent className='w-64 p-3 text-[11px] space-y-2'>
                <h4 className='font-bold flex items-center gap-1.5'>
                  <Brain className='h-3.5 w-3.5' />
                  Session Context
                </h4>
                <div className='space-y-1 text-muted-foreground'>
                  <div className='flex items-center justify-between'>
                    <span>Question Text</span>
                    <Check className='h-3 w-3 text-green-500' />
                  </div>
                  <div className='flex items-center justify-between'>
                    <span>Your Answer</span>
                    {studentAnswer ? (
                      <Check className='h-3 w-3 text-green-500' />
                    ) : (
                      <span className='text-[9px] uppercase'>None</span>
                    )}
                  </div>
                  <div className='flex items-center justify-between'>
                    <span>Formula Sheet</span>
                    <Check className='h-3 w-3 text-green-500' />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
    <div className='flex items-center gap-1'>
      <Button
        variant='ghost'
        size='icon'
        className={cn('rounded-full hover:bg-muted', isCompact ? 'h-6 w-6' : 'h-8 w-8')}
        onClick={() => {
          toggleCompact();
        }}
        title={
          isCompact ? 'Large Mode (Cmd+Shift+M)' : 'Compact Mode (Cmd+Shift+M)'
        }
      >
        {isCompact ? (
          <Maximize2 className='h-3.5 w-3.5' />
        ) : (
          <Minimize2 className='h-4 w-4' />
        )}
      </Button>
      {!isCompact && (
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
      )}
      <Button
        variant='ghost'
        size='icon'
        className={cn('rounded-full hover:bg-muted', isCompact ? 'h-6 w-6' : 'h-8 w-8')}
        onClick={() => {
          setIsOpen(false);
        }}
      >
        <X className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </Button>
    </div>
  </div>
);

const MessageItem = ({
  msg,
  copiedId,
  isCompact,
  handleCopyMessage,
}: {
  msg: { id: string; role: string; content: string };
  copiedId: string | null;
  isCompact: boolean;
  handleCopyMessage: (id: string, content: string, type?: 'text' | 'md') => void;
}) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300 group relative',
      isCompact ? 'max-w-[92%]' : 'max-w-[85%]',
      msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
    )}
  >
    <div
      className={cn(
        'rounded-2xl leading-relaxed shadow-sm',
        isCompact ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2.5 text-[13px]',
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
        <div className='absolute -right-10 top-0 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
          <button
            onClick={() => handleCopyMessage(msg.id, msg.content, 'text')}
            className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors'
            title='Copy as text'
          >
            {copiedId === `${msg.id}-text` ? (
              <ClipboardCheck className='h-3.5 w-3.5 text-green-500' />
            ) : (
              <Copy className='h-3.5 w-3.5' />
            )}
          </button>
          <button
            onClick={() => handleCopyMessage(msg.id, msg.content, 'md')}
            className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-colors'
            title='Copy as Markdown'
          >
            {copiedId === `${msg.id}-md` ? (
              <ClipboardCheck className='h-3.5 w-3.5 text-green-500' />
            ) : (
              <FileText className='h-3.5 w-3.5' />
            )}
          </button>
        </div>
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
    removeLastMessage,
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
      removeLastMessage: s.removeLastMessage,
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
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [sketchDataUrl, setSketchDataUrl] = useState<string | undefined>(undefined);

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

  const handleCopyMessage = (
    id: string,
    content: string,
    type: 'text' | 'md' = 'text',
  ) => {
    void (async () => {
      try {
        let textToCopy = content;

        if (type === 'text') {
          // Convert Markdown to plain text by removing markdown syntax while preserving content
          textToCopy = content
            // Remove code blocks
            .replace(/```[\s\S]*?```/g, (match) => {
              return match.replace(/```\w*\n?|\n?```/g, '').trim();
            })
            // Remove inline code backticks but keep content
            .replace(/`([^`]+)`/g, '$1')
            // Remove bold/italic markers but keep content
            .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/\*([^*]+)\*/g, '$1')
            .replace(/___([^_]+)___/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
            .replace(/_([^_]+)_/g, '$1')
            // Remove headers but keep content
            .replace(/^#{1,6}\s+(.+)$/gm, '$1')
            // Remove links but keep text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove images
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
            // Remove blockquote markers
            .replace(/^>\s+/gm, '')
            // Remove horizontal rules
            .replace(/^[-*_]{3,}$/gm, '')
            // Clean up LaTeX delimiters (keep the math content)
            .replace(/\$\$([^$]+)\$\$/g, '$1')
            .replace(/\$([^$]+)\$/g, '$1');
        }

        await navigator.clipboard.writeText(textToCopy);
        setCopiedId(`${id}-${type}`);
        toast.success(`Copied as ${type === 'text' ? 'plain text' : 'Markdown'}`);
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

  // Smart Scroll logic
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    );
    if (!scrollArea) return;

    const checkIfAtBottom = () => {
      const isAtBottom =
        scrollArea.scrollHeight - scrollArea.scrollTop <=
        scrollArea.clientHeight + 100;
      return isAtBottom;
    };

    // Store whether we were at bottom before streaming started
    if (!isGenerating) {
      wasAtBottomRef.current = checkIfAtBottom();
    }

    // Only auto-scroll during generation if user was already at bottom
    if (isGenerating && wasAtBottomRef.current) {
      scrollToBottom('auto');
    } else if (!isGenerating && wasAtBottomRef.current) {
      scrollToBottom('smooth');
    } else if (messages.length > 0 && !checkIfAtBottom()) {
      setShowScrollButton(true);
    }
  }, [messages, streamedContent, isGenerating]);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLElement | null;

    if (!viewport) return;

    const handleScroll = () => {
      const isAtBottom =
        viewport.scrollHeight - viewport.scrollTop <= viewport.clientHeight + 50;

      if (isAtBottom && showScrollButton) {
        setShowScrollButton(false);
      }

      // Update wasAtBottomRef when user scrolls manually
      if (!isGenerating) {
        wasAtBottomRef.current = isAtBottom;
      }
    };

    viewport.addEventListener('scroll', handleScroll);
    return () => {
      viewport.removeEventListener('scroll', handleScroll);
    };
  }, [showScrollButton, isGenerating]);

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

  // Load sketch preview when includeSketch becomes true
  useEffect(() => {
    if (includeSketch && sketchSessionKey) {
      void (async () => {
        try {
          const dataUrl = await getSketchpadDataUrl(sketchSessionKey);
          setSketchDataUrl(dataUrl);
        } catch (error) {
          console.error('Failed to load sketch preview:', error);
          setSketchDataUrl(undefined);
        }
      })();
    } else {
      setSketchDataUrl(undefined);
    }
  }, [includeSketch, sketchSessionKey]);

  // eslint-disable-next-line complexity
  const handleSend = async (
    overrideValue?: string,
    isDiagnostic = false,
    skipAddingUserMessage = false,
  ) => {
    const finalInputValue = overrideValue ?? inputValue;
    if (!finalInputValue.trim() || isGenerating) return;

    const userMessageContent = finalInputValue;
    if (!overrideValue) setInputValue('');

    // Add user message to store (unless we're regenerating)
    if (!skipAddingUserMessage) {
      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'user',
        content: userMessageContent,
        createdAt: Date.now(),
      });
    }

    setIsGenerating(true);
    setStreamedContent('');

    try {
      console.log(`[Tutor] Starting chat with model: ${activeModel}`);

      setSketchStatus('processing');
      let sketchpadDataUrl: string | undefined = undefined;

      if (includeSketch) {
        sketchpadDataUrl = await new Promise<string | undefined>((resolve) => {
          let resolved = false;

          const handler = (e: Event) => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('tutor-sketch-response', handler);
            const customEvent = e as CustomEvent<{ dataUrl?: string }>;
            resolve(customEvent.detail.dataUrl);
          };
          window.addEventListener('tutor-sketch-response', handler);

          window.dispatchEvent(new CustomEvent('tutor-request-sketch-save'));

          // Fallback to local storage if Sketchpad component is unmounted or doesn't respond
          setTimeout(() => {
            if (resolved) return;
            resolved = true;
            window.removeEventListener('tutor-sketch-response', handler);
            console.warn(
              '[Tutor] Sketchpad did not respond in time, falling back to local storage',
            );
            getSketchpadDataUrl(sketchSessionKey)
              .then(resolve)
              .catch(() => resolve(undefined));
          }, 500);
        });
      }

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

  const handleRegenerate = async () => {
    if (messages.length === 0 || isGenerating) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'assistant') return;

    // Find the last user message before removing anything
    const userMessages = messages.filter((m) => m.role === 'user');
    if (userMessages.length === 0) return;

    const lastUserMsg = userMessages[userMessages.length - 1];

    // Check if the user message was a diagnostic request
    const isDiagnostic =
      lastUserMsg.content ===
      'Please check my work and let me know if I made any errors.';

    // Remove the last assistant message
    removeLastMessage(questionId);

    // Remove the last user message as well
    removeLastMessage(questionId);

    // Re-add the user message and send (using skipAddingUserMessage flag to avoid double-adding)
    addMessage(questionId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: lastUserMsg.content,
      createdAt: Date.now(),
    });

    await handleSend(lastUserMsg.content, isDiagnostic, true);
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
              studentAnswer={studentAnswer}
            />

            {/* Chat Area */}
            <ScrollArea
              ref={scrollAreaRef}
              className='flex-1 min-h-0 p-2 bg-muted/5 relative'
            >
              <div className='space-y-2'>
                {messages.length === 0 && !isGenerating && (
                  <div className='flex flex-col items-center justify-center text-center mt-10 space-y-4 px-4'>
                    <div className='bg-primary/5 p-2 rounded-full'>
                      <Brain
                        className={`text-primary/40 ${!isCompact ? 'h-6 w-6' : 'h-4 w-4'}`}
                      />
                    </div>
                    <div className='space-y-1'>
                      <p className='text-xs font-semibold'>Ask for guidance</p>
                      <p className='text-[11px] text-muted-foreground leading-relaxed'>
                        I can provide hints, check your working, or explain the
                        core concepts of this question.
                      </p>
                    </div>
                    {!isGenerating && (
                      <div className='flex flex-wrap justify-center gap-1.5 pt-2'>
                        {[
                          'Give me a hint',
                          'Explain this concept',
                          'Check my steps',
                        ].map((suggestion) => (
                          <button
                            key={suggestion}
                            onClick={() => void handleSend(suggestion)}
                            className='text-[10px] px-2.5 py-1 rounded-full bg-primary/5 hover:bg-primary/10 text-primary border border-primary/10 transition-colors'
                          >
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={msg.id} className='relative group/msg'>
                    <MessageItem
                      msg={msg}
                      copiedId={copiedId}
                      isCompact={isCompact}
                      handleCopyMessage={handleCopyMessage}
                    />
                    {msg.role === 'assistant' &&
                      idx === messages.length - 1 &&
                      !isGenerating && (
                        <button
                          onClick={() => void handleRegenerate()}
                          className={cn(
                            'absolute -bottom-6 left-0 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary px-2 py-1',
                          )}
                        >
                          <RefreshCcw className='h-3 w-3' />
                          Regenerate
                        </button>
                      )}
                    {msg.role === 'assistant' && idx === messages.length - 1 && (
                      <div className='h-6' />
                    )}
                  </div>
                ))}

                {/* Streaming chunk */}
                {isGenerating && (
                  <div
                    className={cn(
                      'flex flex-col mr-auto items-start space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300',
                      isCompact ? 'max-w-[92%]' : 'max-w-[85%]',
                    )}
                  >
                    <div
                      className={cn(
                        'rounded-2xl leading-relaxed bg-card text-foreground rounded-tl-none border border-border/50 shadow-sm min-w-15',
                        isCompact ? 'px-3 py-1.5 text-[12px]' : 'px-4 py-2.5 text-[13px]',
                      )}
                    >
                      {streamedContent ? (
                        <MarkdownMath content={streamedContent} isStreaming />
                      ) : (
                        <div className='flex flex-col gap-2 py-1'>
                          <div className='flex gap-1'>
                            <motion.div
                              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{
                                repeat: Infinity,
                                duration: 1,
                                times: [0, 0.5, 1],
                              }}
                              className='h-1.5 w-1.5 bg-primary rounded-full'
                            />
                            <motion.div
                              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{
                                repeat: Infinity,
                                duration: 1,
                                delay: 0.2,
                                times: [0, 0.5, 1],
                              }}
                              className='h-1.5 w-1.5 bg-primary rounded-full'
                            />
                            <motion.div
                              animate={{ scale: [1, 1.2, 1], opacity: [0.4, 1, 0.4] }}
                              transition={{
                                repeat: Infinity,
                                duration: 1,
                                delay: 0.4,
                                times: [0, 0.5, 1],
                              }}
                              className='h-1.5 w-1.5 bg-primary rounded-full'
                            />
                          </div>
                          <span className='text-[10px] text-muted-foreground animate-pulse font-medium'>
                            {sketchStatus === 'sending'
                              ? 'Uploading work...'
                              : 'AI Tutor is thinking...'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              <AnimatePresence>
                {showScrollButton && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className='absolute bottom-4 right-4 z-10'
                  >
                    <Button
                      size='icon'
                      variant='secondary'
                      className='h-8 w-8 rounded-full shadow-lg border border-border'
                      onClick={() => {
                        scrollToBottom();
                        setShowScrollButton(false);
                      }}
                    >
                      <ChevronDown className='h-4 w-4' />
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </ScrollArea>

            {/* Input Area */}
            <div className={cn('border-t border-border bg-card shrink-0', isCompact ? 'p-1.5' : 'p-2')}>
              <div
                className={cn(
                  'flex items-center justify-between px-1',
                  isCompact ? 'mb-0.5' : 'mb-1',
                )}
              >
                {sketchSessionKey && (
                  <div className='flex items-center space-x-2'>
                    <Checkbox
                      id='include-sketch'
                      checked={includeSketch}
                      onCheckedChange={(checked) =>
                        setIncludeSketch(checked === true)
                      }
                      className={isCompact ? 'h-3 w-3' : ''}
                    />
                    <Label
                      htmlFor='include-sketch'
                      className={cn(
                        'text-muted-foreground font-medium cursor-pointer',
                        isCompact ? 'text-[9px]' : 'text-[11px]',
                      )}
                    >
                      Include Sketch
                    </Label>
                  </div>
                )}
                <div className='flex items-center gap-1'>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => clearSession(questionId)}
                    disabled={isGenerating || messages.length === 0}
                    className={cn(
                      'text-muted-foreground hover:text-destructive hover:bg-destructive/5 flex items-center gap-1',
                      isCompact ? 'h-5 px-1.5 text-[9px]' : 'h-6 px-2 text-[10px]',
                    )}
                    title='Clear Chat'
                  >
                    <Eraser className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                    Clear
                  </Button>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={handleDiagnosticRequest}
                    disabled={isGenerating}
                    className={cn(
                      'text-primary/70 hover:text-primary hover:bg-primary/5 flex items-center gap-1',
                      isCompact ? 'h-5 px-1.5 text-[9px]' : 'h-6 px-2 text-[10px]',
                    )}
                  >
                    <Activity className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                    Check work
                  </Button>
                </div>
              </div>
              <AnimatePresence>
                {sketchStatus !== 'idle' && sketchStatus !== 'none' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className={cn(
                      'flex items-center gap-2 px-1 text-muted-foreground overflow-hidden',
                      isCompact ? 'mb-1 text-[9px]' : 'mb-2 text-[10px]',
                    )}
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
              {(includeSketch || image?.dataUrl) && (
                <div className='flex gap-2 mb-2 px-1'>
                  {includeSketch && (
                    <div className='relative group'>
                      <div className='w-12 h-12 rounded-md border border-border bg-white overflow-hidden flex items-center justify-center'>
                        {sketchDataUrl ? (
                          <img
                            src={sketchDataUrl}
                            alt='Sketch preview'
                            className='w-full h-full object-cover'
                          />
                        ) : (
                          <PencilRuler className='h-5 w-5 text-muted-foreground/40' />
                        )}
                      </div>
                      <div className='absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md'>
                        <span className='text-[8px] font-bold text-primary uppercase'>
                          Sketch
                        </span>
                      </div>
                      <button
                        onClick={() => setIncludeSketch(false)}
                        className='absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 shadow-sm hover:bg-muted'
                      >
                        <X className='h-2.5 w-2.5' />
                      </button>
                    </div>
                  )}
                  {image?.dataUrl && (
                    <div className='relative group'>
                      <div className='w-12 h-12 rounded-md border border-border overflow-hidden'>
                        <img
                          src={image.dataUrl}
                          alt='Attachment'
                          className='w-full h-full object-cover'
                        />
                      </div>
                      <div className='absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'>
                        <span className='text-[8px] font-bold text-primary uppercase'>
                          Image
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className='relative flex items-end gap-2'>
                <Textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder='Ask for a hint...'
                  className={cn(
                    'max-h-30 resize-none rounded-xl bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/20',
                    isCompact
                      ? 'min-h-9 py-2 px-3 text-[11px] pr-10'
                      : 'min-h-11 py-3 px-4 text-xs pr-12',
                  )}
                  disabled={isGenerating}
                />
                <Button
                  size='icon'
                  className={cn(
                    'absolute transition-all duration-200',
                    isCompact
                      ? 'right-1 bottom-1 h-7 w-7 rounded-md'
                      : 'right-1.5 bottom-1.5 h-8 w-8 rounded-lg',
                  )}
                  onClick={() => void handleSend()}
                  disabled={!inputValue.trim() || isGenerating}
                >
                  <Send className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}