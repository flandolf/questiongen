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
      'flex items-center justify-between border-b border-border bg-muted/20 backdrop-blur-md shrink-0',
      isCompact ? 'px-3 py-2' : 'px-4 py-3',
    )}
  >
    <div className='flex items-center gap-3'>
      {!isCompact && (
        <div className='bg-primary/5 p-2 rounded-lg border border-primary/10'>
          <Sparkles className='h-4 w-4 text-primary/80' />
        </div>
      )}
      <div className='min-w-0 space-y-0.5'>
        <h3 className='font-bold text-sm flex items-center gap-2 truncate tracking-tight'>
          {!isCompact && <span className="opacity-90">AI Tutor</span>}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'font-mono uppercase tracking-wider text-muted-foreground bg-muted/50 rounded-md border border-border/50 hover:bg-muted hover:text-foreground transition-all truncate',
                  isCompact
                    ? 'text-[8px] px-1.5 py-0.5'
                    : 'text-[9px] px-2 py-0.5',
                )}
              >
                {modelName || 'Select Model'}
              </button>
            </PopoverTrigger>
            <PopoverContent className='w-72 p-4 shadow-xl border-border/60' align='start'>
              <div className='space-y-4'>
                <div className='space-y-2'>
                  <Label className='text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold'>
                    Computational Model
                  </Label>
                  <Select
                    value={activeModel}
                    onValueChange={(val) => {
                      updateSessionOverrides(questionId, {
                        model: val,
                      });
                    }}
                  >
                    <SelectTrigger className='h-9 text-xs font-medium'>
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
                <div className='space-y-2'>
                  <Label className='text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-bold'>
                    Tutor Persona
                  </Label>
                  <Textarea
                    value={activePersona}
                    onChange={(e) => {
                      updateSessionOverrides(questionId, {
                        persona: e.target.value,
                      });
                    }}
                    placeholder='Custom tutor instructions...'
                    className='text-xs min-h-24 resize-none bg-muted/20 border-border/40 focus-visible:ring-primary/20'
                  />
                  <Button
                    variant='outline'
                    size='sm'
                    className='w-full h-8 text-[10px] font-bold tracking-wide'
                    onClick={() => {
                      clearSession(questionId);
                    }}
                  >
                    <Trash2 className='h-3 w-3 mr-2' />
                    RESET SESSION
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </h3>
        {!isCompact && (
          <div className='flex items-center gap-2'>
            <p className='text-[10px] text-muted-foreground/80 font-mono tracking-tight'>
              {totalTokensSession > 0 ? (
                <>
                  <span className="font-bold text-primary/70">{totalTokensSession.toLocaleString()}</span>
                  <span className="mx-1 opacity-50">TOKENS</span>
                  <span className="opacity-50">/</span>
                  <span className="ml-1 font-bold text-primary/70">${totalCostSession.toFixed(4)}</span>
                </>
              ) : (
                'SCHOLARLY ASSISTANCE'
              )}
            </p>
            <Popover>
              <PopoverTrigger asChild>
                <button className='text-muted-foreground/60 hover:text-primary transition-colors'>
                  <Info className='h-3 w-3' />
                </button>
              </PopoverTrigger>
              <PopoverContent className='w-64 p-4 text-[11px] space-y-3 shadow-xl'>
                <h4 className='font-bold flex items-center gap-2 text-foreground/90'>
                  <Brain className='h-4 w-4 text-primary' />
                  SESSION CONTEXT
                </h4>
                <div className='space-y-2 text-muted-foreground font-medium'>
                  <div className='flex items-center justify-between border-b border-border/30 pb-1'>
                    <span>Exam Question</span>
                    <Check className='h-3.5 w-3.5 text-primary' />
                  </div>
                  <div className='flex items-center justify-between border-b border-border/30 pb-1'>
                    <span>Student Response</span>
                    {studentAnswer ? (
                      <Check className='h-3.5 w-3.5 text-primary' />
                    ) : (
                      <span className='text-[9px] font-bold opacity-40 uppercase'>Not provided</span>
                    )}
                  </div>
                  <div className='flex items-center justify-between'>
                    <span>VCE Formula Sheet</span>
                    <Check className='h-3.5 w-3.5 text-primary' />
                  </div>
                </div>
                <p className="text-[9px] leading-relaxed text-muted-foreground/70 italic border-t border-border/30 pt-2">
                  The AI analyzes your working against official curriculum standards to provide targeted feedback.
                </p>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>
    </div>
    <div className='flex items-center gap-1.5'>
      <Button
        variant='ghost'
        size='icon'
        className={cn(
          'rounded-full hover:bg-muted transition-all active:scale-90',
          isCompact ? 'h-7 w-7' : 'h-8 w-8',
        )}
        onClick={() => {
          toggleCompact();
        }}
        title={
          isCompact ? 'Standard View (Cmd+Shift+M)' : 'Compact View (Cmd+Shift+M)'
        }
      >
        {isCompact ? (
          <Maximize2 className='h-4 w-4' />
        ) : (
          <Minimize2 className='h-4 w-4' />
        )}
      </Button>
      {!isCompact && (
        <Button
          variant='ghost'
          size='icon'
          className='h-8 w-8 rounded-full hover:bg-muted active:scale-90'
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
        className={cn(
          'rounded-full hover:bg-destructive/10 hover:text-destructive transition-all active:scale-90',
          isCompact ? 'h-7 w-7' : 'h-8 w-8',
        )}
        onClick={() => {
          setIsOpen(false);
        }}
      >
        <X className={isCompact ? 'h-4 w-4' : 'h-5 w-5'} />
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
  handleCopyMessage: (
    id: string,
    content: string,
    type?: 'text' | 'md',
  ) => void;
}) => (
  <div
    className={cn(
      'flex flex-col space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-400 group min-w-0',
      msg.role === 'assistant'
        ? isCompact
          ? 'max-w-[88%]'
          : 'max-w-[82%]'
        : isCompact
          ? 'max-w-[90%]'
          : 'max-w-[85%]',
      msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
    )}
  >
    <div
      className={cn(
        'rounded-xl leading-relaxed shadow-sm min-w-0 overflow-hidden transition-colors',
        isCompact ? 'px-3.5 py-2 text-[12px]' : 'px-4.5 py-3 text-[13px]',
        msg.role === 'user'
          ? 'bg-primary/95 text-primary-foreground rounded-tr-none shadow-md'
          : 'bg-card/80 text-foreground rounded-tl-none border border-border/40 backdrop-blur-sm',
      )}
    >
      <div
        className={cn(
          'min-w-0 [&_.katex-display]:overflow-x-auto [&_.katex-display]:max-w-full [&_.math-display]:overflow-x-auto [&_.math-display]:max-w-full tracking-tight',
          msg.role === 'user'
            ? 'text-primary-foreground [&_.math-inline]:text-primary-foreground [&_.math-display]:text-primary-foreground'
            : 'prose-sm leading-relaxed',
        )}
      >
        <MarkdownMath content={msg.content} />
      </div>
    </div>

    {msg.role === 'assistant' && (
      <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 ml-1 mt-0.5'>
        <button
          onClick={() => handleCopyMessage(msg.id, msg.content, 'text')}
          className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90'
          title='Copy plain text'
        >
          {copiedId === `${msg.id}-text` ? (
            <ClipboardCheck className='h-3.5 w-3.5 text-primary' />
          ) : (
            <Copy className='h-3.5 w-3.5' />
          )}
        </button>
        <button
          onClick={() => handleCopyMessage(msg.id, msg.content, 'md')}
          className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90'
          title='Copy Markdown source'
        >
          {copiedId === `${msg.id}-md` ? (
            <ClipboardCheck className='h-3.5 w-3.5 text-primary' />
          ) : (
            <FileText className='h-3.5 w-3.5' />
          )}
        </button>
      </div>
    )}
  </div>
);

const TutorEmptyState = ({
  isCompact,
  onSuggestion,
}: {
  isCompact: boolean;
  onSuggestion: (s: string) => void;
}) => (
  <div className='flex flex-col items-center justify-center text-center space-y-5 px-6'>
    <div className='bg-primary/5 p-3 rounded-2xl border border-primary/10 shadow-inner'>
      <Brain
        className={`text-primary/60 ${!isCompact ? 'h-7 w-7' : 'h-5 w-5'}`}
      />
    </div>
    <div className='space-y-1.5 max-w-70'>
      <p className='text-xs font-bold tracking-tight text-foreground/90 uppercase opacity-80'>Academic Consultation</p>
      <p className='text-[11px] text-muted-foreground leading-relaxed'>
        The tutor is prepared to analyze your methodology, provide conceptual clarification, or offer strategic hints for this VCE problem.
      </p>
    </div>
    <div className='flex flex-wrap justify-center gap-2 pt-3'>
      {[
        { text: 'Conceptual hint', icon: Sparkles },
        { text: 'Methodology check', icon: Activity },
        { text: 'Analyze steps', icon: PencilRuler }
      ].map(
        (suggestion) => (
          <button
            aria-label={`Send suggestion: ${suggestion.text}`}
            key={suggestion.text}
            onClick={() => onSuggestion(suggestion.text)}
            className='text-[10px] font-bold px-3 py-1.5 rounded-lg text-primary border border-primary/10 transition-all active:scale-95 flex items-center gap-1.5 shadow-sm'
          >
            <suggestion.icon className="h-3 w-3 opacity-70" />
            {suggestion.text.toUpperCase()}
          </button>
        ),
      )}
    </div>
  </div>
);

async function copyToClipboard(
  content: string,
  type: 'text' | 'md' = 'text',
): Promise<string> {
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
  return type;
}

async function performTutorChat(params: {
  activeModel: string;
  activePersona: string;
  contextPrompt: string;
  studentAnswer?: string;
  userMessageContent: string;
  messages: { role: string; content: string }[];
  image?: StudentAnswerImage;
  sketchpadDataUrl?: string;
  apiKey: string;
  isDiagnostic: boolean;
}) {
  const {
    activeModel,
    activePersona,
    contextPrompt,
    studentAnswer,
    userMessageContent,
    messages,
    image,
    sketchpadDataUrl,
    apiKey,
    isDiagnostic,
  } = params;

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
      role: m.role as 'system' | 'user' | 'assistant',
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
  return await invoke<TutorChatResponse>('tutor_chat', {
    request: {
      messages: apiMessages,
      model: activeModel,
      apiKey: apiKey,
      diagnostic: isDiagnostic,
    },
  });
}

const TutorChatArea = ({
  messages,
  isGenerating,
  isCompact,
  streamedContent,
  sketchStatus,
  copiedId,
  showScrollButton,
  scrollAreaRef,
  messagesEndRef,
  handleCopyMessage,
  handleRegenerate,
  handleSend,
  scrollToBottom,
  setShowScrollButton,
}: {
  messages: { id: string; role: string; content: string; createdAt: number }[];
  isGenerating: boolean;
  isCompact: boolean;
  streamedContent: string;
  sketchStatus: string;
  copiedId: string | null;
  showScrollButton: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  handleCopyMessage: (
    id: string,
    content: string,
    type?: 'text' | 'md',
  ) => void;
  handleRegenerate: () => void;
  handleSend: (suggestion: string) => void;
  scrollToBottom: () => void;
  setShowScrollButton: (show: boolean) => void;
}) => (
  <ScrollArea
    ref={scrollAreaRef}
    className='flex-1 min-h-0 bg-muted/5 relative'
  >
    <div className='flex flex-col min-h-full'>
      {messages.length === 0 && !isGenerating ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <TutorEmptyState
            isCompact={isCompact}
            onSuggestion={(s) => void handleSend(s)}
          />
        </div>
      ) : (
        <div className='flex-1 flex flex-col justify-end p-4 space-y-4'>
          <div className='flex-1' />
          <TutorMessageList
            messages={messages}
            isCompact={isCompact}
            isGenerating={isGenerating}
            copiedId={copiedId}
            handleCopyMessage={handleCopyMessage}
            handleRegenerate={handleRegenerate}
          />

          <TutorStreamingChunk
            isGenerating={isGenerating}
            isCompact={isCompact}
            streamedContent={streamedContent}
            sketchStatus={sketchStatus}
          />
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>

    <TutorScrollButton
      show={showScrollButton}
      onClick={() => {
        scrollToBottom();
        setShowScrollButton(false);
      }}
    />
  </ScrollArea>
);

const TutorInputArea = ({
  isCompact,
  isGenerating,
  inputValue,
  includeSketch,
  sketchSessionKey,
  sketchStatus,
  sketchDataUrl,
  image,
  messages,
  questionId,
  setInputValue,
  setIncludeSketch,
  handleSend,
  handleKeyDown,
  handleDiagnosticRequest,
  clearSession,
}: {
  isCompact: boolean;
  isGenerating: boolean;
  inputValue: string;
  includeSketch: boolean;
  sketchSessionKey?: string;
  sketchStatus: string;
  sketchDataUrl?: string;
  image?: StudentAnswerImage;
  messages: readonly { id: string }[];
  questionId: string;
  setInputValue: (v: string) => void;
  setIncludeSketch: (v: boolean) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleDiagnosticRequest: () => void;
  clearSession: (qid: string) => void;
}) => (
  <div
    className={cn(
      'border-t border-border bg-card shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.03)]',
      isCompact ? 'p-2' : 'p-3',
    )}
  >
    <div
      className={cn(
        'flex items-center justify-between px-1.5',
        isCompact ? 'mb-1.5' : 'mb-2',
      )}
    >
      {sketchSessionKey && (
        <div className='flex items-center space-x-2.5 group cursor-pointer'>
          <Checkbox
            id='include-sketch'
            checked={includeSketch}
            onCheckedChange={(checked) => setIncludeSketch(checked === true)}
            className={cn("transition-all", isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4')}
          />
          <Label
            htmlFor='include-sketch'
            className={cn(
              'text-muted-foreground font-bold cursor-pointer uppercase tracking-wider transition-colors group-hover:text-primary/80',
              isCompact ? 'text-[8px]' : 'text-[9px]',
            )}
          >
            Include Sketch
          </Label>
        </div>
      )}
      <div className='flex items-center gap-1.5'>
        <Button
          variant='ghost'
          size='sm'
          onClick={() => clearSession(questionId)}
          disabled={isGenerating || messages.length === 0}
          className={cn(
            'text-muted-foreground/70 hover:text-destructive hover:bg-destructive/5 flex items-center gap-1.5 font-bold tracking-tight transition-all',
            isCompact ? 'h-6 px-2 text-[8px]' : 'h-7 px-2.5 text-[9px]',
          )}
          title='Purge session history'
        >
          <Eraser className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          CLEAR
        </Button>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleDiagnosticRequest}
          disabled={isGenerating}
          className={cn(
            'text-primary/70 hover:text-primary hover:bg-primary/5 flex items-center gap-1.5 font-bold tracking-tight transition-all',
            isCompact ? 'h-6 px-2 text-[8px]' : 'h-7 px-2.5 text-[9px]',
          )}
          title="Analyze working for errors"
        >
          <Activity className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          CHECK WORK
        </Button>
      </div>
    </div>
    <TutorSketchStatus sketchStatus={sketchStatus} isCompact={isCompact} />
    <TutorAttachmentPreview
      includeSketch={includeSketch}
      sketchDataUrl={sketchDataUrl}
      image={image}
      setIncludeSketch={setIncludeSketch}
    />
    <div className='relative flex items-end gap-2 px-1'>
      <Textarea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='Inquire for academic guidance...'
        className={cn(
          'max-h-32 resize-none rounded-xl bg-muted/20 border-border/40 focus-visible:ring-primary/20 transition-all placeholder:italic placeholder:opacity-50',
          isCompact
            ? 'min-h-10 py-2.5 px-3.5 text-[11px] pr-12'
            : 'min-h-12 py-3.5 px-4.5 text-xs pr-14',
        )}
        disabled={isGenerating}
      />
      <Button
        size='icon'
        className={cn(
          'absolute transition-all duration-300 shadow-sm hover:shadow-md active:scale-90',
          isCompact
            ? 'right-2 bottom-1.5 h-7 w-7 rounded-lg'
            : 'right-2.5 bottom-2 h-8 w-8 rounded-xl',
        )}
        onClick={() => void handleSend()}
        disabled={!inputValue.trim() || isGenerating}
      >
        <Send className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      </Button>
    </div>
  </div>
);

const TutorStreamingChunk = ({
  isGenerating,
  isCompact,
  streamedContent,
  sketchStatus,
}: {
  isGenerating: boolean;
  isCompact: boolean;
  streamedContent: string;
  sketchStatus: string;
}) => {
  if (!isGenerating) return null;

  return (
    <div
      className={cn(
        'flex flex-col mr-auto items-start space-y-1 animate-in fade-in slide-in-from-bottom-2 duration-400 min-w-0',
        isCompact ? 'max-w-[88%]' : 'max-w-[82%]',
      )}
    >
      <div
        className={cn(
          'rounded-xl leading-relaxed bg-card/80 text-foreground rounded-tl-none border border-border/40 shadow-sm min-w-16 overflow-hidden backdrop-blur-sm',
          isCompact ? 'px-3.5 py-2 text-[12px]' : 'px-4.5 py-3 text-[13px]',
        )}
      >
        {streamedContent ? (
          <MarkdownMath content={streamedContent + ' ▋'} isStreaming />
        ) : (
          <div className='flex flex-col gap-2.5 py-1.5'>
            <div className='flex gap-1.5 ml-0.5'>
              {[0, 0.2, 0.4].map((delay) => (
                <motion.div
                  key={delay}
                  animate={{
                    scale: [1, 1.25, 1],
                    opacity: [0.3, 0.8, 0.3],
                    backgroundColor: ['var(--primary)', 'var(--primary)', 'var(--primary)']
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    times: [0, 0.5, 1],
                    delay,
                  }}
                  className='h-1 w-1 bg-primary/60 rounded-full'
                />
              ))}
            </div>
            <span className='text-[9px] uppercase tracking-[0.1em] text-muted-foreground/80 animate-pulse font-bold'>
              {sketchStatus === 'sending'
                ? 'Uploading...'
                : 'Processing Inquiry...'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

const TutorMessageList = ({
  messages,
  isCompact,
  isGenerating,
  copiedId,
  handleCopyMessage,
  handleRegenerate,
}: {
  messages: { id: string; role: string; content: string; createdAt: number }[];
  isCompact: boolean;
  isGenerating: boolean;
  copiedId: string | null;
  handleCopyMessage: (
    id: string,
    content: string,
    type?: 'text' | 'md',
  ) => void;
  handleRegenerate: () => void;
}) => (
  <>
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
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void handleRegenerate()}
              className={cn(
                'absolute -bottom-5.5 left-1 opacity-0 group-hover/msg:opacity-100 transition-all flex items-center gap-1.5 text-[9px] font-bold tracking-tight text-muted-foreground hover:text-primary px-2 h-5 rounded-md hover:bg-primary/5',
              )}
            >
              <RefreshCcw className='h-2.5 w-2.5' />
              REGENERATE
            </Button>
          )}
        {msg.role === 'assistant' && idx === messages.length - 1 && (
          <div className='h-5' />
        )}
      </div>
    ))}
  </>
);

async function getSketchpadImage(
  sketchSessionKey: string,
): Promise<string | undefined> {
  return await new Promise<string | undefined>((resolve) => {
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

const TutorScrollButton = ({
  show,
  onClick,
}: {
  show: boolean;
  onClick: () => void;
}) => (
  <AnimatePresence>
    {show && (
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
          onClick={onClick}
        >
          <ChevronDown className='h-4 w-4' />
        </Button>
      </motion.div>
    )}
  </AnimatePresence>
);

function calculateTutorMetrics(result: TutorChatResponse) {
  const promptTokens = Number(result.promptTokens ?? result.prompt_tokens);
  const completionTokens = Number(
    result.completionTokens ?? result.completion_tokens,
  );
  const directTotalTokens = Number(result.totalTokens ?? result.total_tokens);
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

  return { totalTokens, cost };
}

const TutorAttachmentPreview = ({
  includeSketch,
  sketchDataUrl,
  image,
  setIncludeSketch,
}: {
  includeSketch: boolean;
  sketchDataUrl?: string;
  image?: StudentAnswerImage;
  setIncludeSketch: (v: boolean) => void;
}) => {
  if (!includeSketch && !image?.dataUrl) return null;

  return (
    <div className='flex gap-2 mb-2 px-1'>
      {includeSketch && (
        <div className='relative group'>
          <div className='w-12 h-12 rounded-md border border-border bg-card overflow-hidden flex items-center justify-center shadow-sm'>
            {sketchDataUrl ? (
              <img
                src={sketchDataUrl}
                alt='Sketch preview'
                className='w-full h-full object-cover'
              />
            ) : (
              <PencilRuler className='h-5 w-5 text-muted-foreground/30' />
            )}
          </div>
          <div className='absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md'>
            <span className='text-[8px] font-bold text-primary uppercase'>
              Sketch
            </span>
          </div>
          <button
            aria-label='Remove sketch from attachments'
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
  );
};

const TutorSketchStatus = ({
  sketchStatus,
  isCompact,
}: {
  sketchStatus: string;
  isCompact: boolean;
}) => (
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
  const [sketchDataUrl, setSketchDataUrl] = useState<string | undefined>(
    undefined,
  );
  const [dynamicPanelWidth, setDynamicPanelWidth] = useState<number | null>(
    null,
  );
  const [lastLayoutUpdate, setLastLayoutUpdate] = useState(0);

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
        await copyToClipboard(content, type);
        setCopiedId(`${id}-${type}`);
        toast.success(
          `Copied as ${type === 'text' ? 'plain text' : 'Markdown'}`,
        );
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
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    );
    if (viewport) {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
    }
  };

  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLElement | null;
    if (!viewport) return;

    const checkIfAtBottom = () => {
      const isAtBottom =
        viewport.scrollHeight - viewport.scrollTop <=
        viewport.clientHeight + 100;
      return isAtBottom;
    };

    // Store whether we were at bottom before streaming started
    if (!isGenerating) {
      wasAtBottomRef.current = checkIfAtBottom();
    }

    // Only auto-scroll during generation if user was already at bottom
    if (isGenerating && wasAtBottomRef.current) {
      // Use 'auto' during streaming for immediate positioning, 
      // but ensure it happens after the DOM has likely updated
      requestAnimationFrame(() => {
        scrollToBottom('auto');
      });
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
        viewport.scrollHeight - viewport.scrollTop <=
        viewport.clientHeight + 50;

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

  // Expand panel width for wide rendered math content (e.g., long integrals)
  // while keeping the panel inside the viewport.
  useEffect(() => {
    if (!isOpen) return;

    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    ) as HTMLElement | null;

    if (!viewport) return;

    const isSmallScreen = window.matchMedia('(max-width: 640px)').matches;
    const horizontalMargin = isSmallScreen ? 32 : 48;
    const maxAllowedWidth = Math.max(320, window.innerWidth - horizontalMargin);

    const baseWidth = isCompact ? 416 : 512;
    const hardCap = isCompact ? 580 : 1100;
    const boundedMaxWidth = Math.min(maxAllowedWidth, hardCap);

    let widestMath = 0;

    const mathNodes = viewport.querySelectorAll(
      '.math-node, .mjx-container, .katex-display .katex, .math-display',
    );

    mathNodes.forEach((node) => {
      const el = node as HTMLElement;
      // For display math, we want the inner content width, not the 100% container width
      const innerMath = el.querySelector('.mjx-math, .katex, svg');
      const measureTarget = innerMath || el;
      widestMath = Math.max(widestMath, (measureTarget as HTMLElement).scrollWidth);
    });

    const bubbleRatio = isCompact ? 0.88 : 0.82;
    const contentDrivenWidth = widestMath
      ? Math.ceil(widestMath / bubbleRatio + (isCompact ? 48 : 64))
      : baseWidth;

    const nextWidth = Math.max(
      baseWidth,
      Math.min(boundedMaxWidth, contentDrivenWidth),
    );

    setDynamicPanelWidth((prev) => {
      // Avoid tiny adjustments that cause layout jitter
      if (prev !== null && Math.abs(prev - nextWidth) < 4) return prev;
      return nextWidth;
    });
  }, [
    isOpen,
    isCompact,
    messages,
    streamedContent,
    showScrollButton,
    sketchStatus,
    lastLayoutUpdate,
  ]);

  // Listen for MathJax completion events to trigger width recalculation
  useEffect(() => {
    if (!isOpen) return;

    const viewport = scrollAreaRef.current?.querySelector(
      '[data-radix-scroll-area-viewport]',
    );
    if (!viewport) return;

    const handleMathTypeset = () => {
      setLastLayoutUpdate(Date.now());
    };

    viewport.addEventListener('math-typeset-complete', handleMathTypeset);

    const observer = new ResizeObserver(() => {
      handleMathTypeset();
    });
    observer.observe(viewport);

    return () => {
      viewport.removeEventListener('math-typeset-complete', handleMathTypeset);
      observer.disconnect();
    };
  }, [isOpen]);

  // Setup SSE listener for streaming tokens with throttling
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    let buffer = '';
    let throttleTimeout: ReturnType<typeof setTimeout> | null = null;

    const flushBuffer = () => {
      if (buffer) {
        appendStreamedContent(buffer);
        buffer = '';
      }
      throttleTimeout = null;
    };

    listen<{ text: string }>('tutor-generation-token', (event) => {
      buffer += event.payload.text;

      if (!throttleTimeout) {
        // Flush every 50ms for smooth 20fps updates
        throttleTimeout = setTimeout(flushBuffer, 50);
      }
    })
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch(console.error);

    return () => {
      cancelled = true;
      unlisten?.();
      if (throttleTimeout) clearTimeout(throttleTimeout);
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

      if (includeSketch && sketchSessionKey) {
        sketchpadDataUrl = await getSketchpadImage(sketchSessionKey);
      }

      if (sketchpadDataUrl) {
        setSketchStatus('sending');
      } else {
        setSketchStatus('none');
      }

      const result = await performTutorChat({
        activeModel,
        activePersona,
        contextPrompt,
        studentAnswer,
        userMessageContent,
        messages,
        image,
        sketchpadDataUrl,
        apiKey,
        isDiagnostic,
      });

      // Add assistant message to store
      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        createdAt: Date.now(),
      });

      // Update metrics
      const { totalTokens, cost } = calculateTutorMetrics(result);

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
      <AnimatePresence>
        {!isOpen ? (
          <motion.div
            key='tutor-toggle'
            initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8, rotate: 20 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className='pointer-events-auto'
          >
            <Button
              onClick={() => setIsOpen(true)}
              size='icon'
              className='h-14 w-14 rounded-full shadow-2xl bg-primary hover:bg-primary/90 active:scale-90 group relative overflow-hidden'
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <Brain className='h-7 w-7 text-primary-foreground group-hover:rotate-[15deg] transition-transform duration-500 relative z-10' />
              <div className="absolute -inset-1 bg-primary/20 rounded-full animate-ping opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key='tutor-panel'
            layoutId="tutor-container"
            initial={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 40, scale: 0.9, filter: 'blur(10px)' }}
            transition={{ 
              type: 'spring', 
              damping: 30, 
              stiffness: 400,
              opacity: { duration: 0.2 },
              filter: { duration: 0.2 }
            }}
            className={cn(
              'pointer-events-auto flex flex-col bg-card/95 border border-border/60 rounded-3xl shadow-2xl overflow-hidden backdrop-blur-xl origin-bottom-left',
              isCompact
                ? 'w-[min(26rem,calc(100vw-2rem))] h-[clamp(18rem,55dvh,28rem)]'
                : 'w-[min(32rem,calc(100vw-2rem))] h-[clamp(24rem,72dvh,45rem)] max-h-[calc(100dvh-5rem)]',
            )}
            style={
              dynamicPanelWidth && isOpen
                ? {
                  width: `${dynamicPanelWidth}px`,
                  maxWidth: 'calc(100vw - 2rem)',
                }
                : undefined
            }
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
            <TutorChatArea
              messages={messages}
              isGenerating={isGenerating}
              isCompact={isCompact}
              streamedContent={streamedContent}
              sketchStatus={sketchStatus}
              copiedId={copiedId}
              showScrollButton={showScrollButton}
              scrollAreaRef={scrollAreaRef}
              messagesEndRef={messagesEndRef}
              handleCopyMessage={handleCopyMessage}
              handleRegenerate={() => {
                void handleRegenerate();
              }}
              handleSend={(s) => {
                void handleSend(s);
              }}
              scrollToBottom={scrollToBottom}
              setShowScrollButton={setShowScrollButton}
            />

            {/* Input Area */}
            <TutorInputArea
              isCompact={isCompact}
              isGenerating={isGenerating}
              inputValue={inputValue}
              includeSketch={includeSketch}
              sketchSessionKey={sketchSessionKey}
              sketchStatus={sketchStatus}
              sketchDataUrl={sketchDataUrl}
              image={image}
              messages={messages}
              questionId={questionId}
              setInputValue={setInputValue}
              setIncludeSketch={setIncludeSketch}
              handleSend={() => {
                void handleSend();
              }}
              handleKeyDown={handleKeyDown}
              handleDiagnosticRequest={handleDiagnosticRequest}
              clearSession={clearSession}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}