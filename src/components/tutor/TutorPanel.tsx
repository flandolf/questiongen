import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  FileText,
  Info,
  Loader2,
  Maximize2,
  MessageSquarePlus,
  Minimize2,
  Pencil,
  PencilRuler,
  RefreshCcw,
  Send,
  Sparkles,
  StopCircle,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { useAppSettings } from '@/AppContext';
import { MarkdownMath } from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store';
import { getLatestSketch } from '@/store/sketchpad-sync';
import { useTutorStore } from '@/store/tutor';
import type { StudentAnswerImage } from '@/types';
import {
  getModelCredentials,
  getProviderLabelForModel,
  type ProviderState,
} from '@/types/provider';
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

const TutorHeader = ({
  modelName,
  totalTokensSession,
  totalCostSession,
  activeModel,
  activePersona,
  questionId,
  isCompact,
  showContext,
  onToggleContext,
  setIsOpen,
  toggleCompact,
  updateSessionOverrides,
  clearSession,
  handleExportTranscript,
  studentAnswer,
  providers,
  activeProviderId,
}: {
  modelName: string;
  totalTokensSession: number;
  totalCostSession: number;
  activeModel: string;
  activePersona: string;
  questionId: string;
  isCompact: boolean;
  showContext: boolean;
  onToggleContext: () => void;
  setIsOpen: (open: boolean) => void;
  toggleCompact: () => void;
  updateSessionOverrides: (
    qid: string,
    overrides: { model?: string; persona?: string },
  ) => void;
  clearSession: (qid: string) => void;
  handleExportTranscript: () => void;
  studentAnswer?: string;
  /**
   * Provider context for accurate per-model badges. Without this,
   * NVIDIA + custom-provider models with `author/slug` ids mis-label
   * as OpenRouter.
   */
  providers?: Record<string, ProviderState>;
  activeProviderId?: string;
}) => (
  <div
    className={cn(
      'flex items-center justify-between border-b border-border bg-muted/5 backdrop-blur-xl shrink-0 transition-all duration-500',
      isCompact ? 'px-4 py-2' : 'px-6 py-4',
    )}
  >
    <div className='flex items-center gap-4'>
      <div className='flex flex-col gap-0.5'>
        <div className='flex items-center gap-2'>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'font-mono uppercase tracking-widest text-muted-foreground/80 hover:text-primary transition-all text-[10px] flex items-center gap-1.5 group',
                )}
              >
                <span className='border-b border-transparent hover:border-primary/30 pb-0.5'>
                  {modelName || 'Select Model'}
                </span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              className='w-72 p-5 shadow-2xl border-border/40 backdrop-blur-2xl bg-popover/95'
              align='start'
            >
              <div className='space-y-5'>
                <div className='space-y-2.5'>
                  <Label className='text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold flex items-center gap-2'>
                    <Brain className='h-3 w-3 opacity-60' />
                    Model
                  </Label>
                  <Select
                    value={activeModel}
                    onValueChange={(val) => {
                      updateSessionOverrides(questionId, {
                        model: val,
                      });
                    }}
                  >
                    <SelectTrigger className='h-9 text-xs font-medium bg-muted/20 border-border/30 w-full'>
                      <SelectValue placeholder='Select model' />
                    </SelectTrigger>
                    <SelectContent>
                      {[...PRESET_MODELS, ...PRESET_IMAGE_MODELS]
                        .filter(
                          (m, i, self) =>
                            self.findIndex((t) => t.id === m.id) === i,
                        )
                        .map((m) => {
                          const provider =
                            m.id !== 'custom'
                              ? getProviderLabelForModel(
                                  m.id,
                                  providers ?? {},
                                  activeProviderId,
                                )
                              : '';
                          return (
                            <SelectItem
                              key={m.id}
                              value={m.id}
                              className='text-xs'
                            >
                              {m.id === 'custom' ? (
                                m.name
                              ) : (
                                <span className='flex items-center gap-2 min-w-0'>
                                  <span className='truncate'>{m.name}</span>
                                  {provider && (
                                    <span className='shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground font-medium leading-none'>
                                      {provider}
                                    </span>
                                  )}
                                </span>
                              )}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                </div>
                <div className='space-y-2.5'>
                  <Label className='text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-bold flex items-center gap-2'>
                    <MessageSquarePlus className='h-3 w-3 opacity-60' />
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
                    className='text-xs min-h-24 resize-none bg-muted/20 border-border/30 focus-visible:ring-primary/20 leading-relaxed'
                  />
                  <div className='pt-2 flex gap-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      className='flex-1 h-8 text-[10px] font-bold tracking-wider hover:bg-destructive/5 hover:text-destructive hover:border-destructive/30 transition-all'
                      onClick={() => {
                        clearSession(questionId);
                      }}
                    >
                      <Trash2 className='h-3 w-3 mr-2 opacity-70' />
                      RESET SESSION
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button className='text-muted-foreground/40 hover:text-primary transition-colors p-1'>
                <Info className='h-3 w-3' />
              </button>
            </PopoverTrigger>
            <PopoverContent className='w-72 p-5 text-[11px] space-y-4 shadow-2xl border-border/40 backdrop-blur-2xl bg-popover/95'>
              <h4 className='font-bold flex items-center gap-2 text-[10px] uppercase tracking-[0.15em] text-foreground/80'>
                <Brain className='h-3.5 w-3.5 text-primary' />
                Session Architecture
              </h4>
              <div className='space-y-2.5 text-muted-foreground font-medium'>
                <div className='flex items-center justify-between border-b border-border/10 pb-1.5'>
                  <span>Exam Question</span>
                  <Check className='h-3.5 w-3.5 text-primary opacity-80' />
                </div>
                <div className='flex items-center justify-between border-b border-border/10 pb-1.5'>
                  <span>Student Response</span>
                  {studentAnswer ? (
                    <Check className='h-3.5 w-3.5 text-primary opacity-80' />
                  ) : (
                    <span className='text-[9px] font-bold opacity-30 uppercase tracking-tighter'>
                      None
                    </span>
                  )}
                </div>
                <div className='flex items-center justify-between'>
                  <span>VCE Formula Sheet</span>
                  <Check className='h-3.5 w-3.5 text-primary opacity-80' />
                </div>
              </div>
              <p className='text-[9px] leading-relaxed text-muted-foreground/60 italic border-t border-border/10 pt-3'>
                The AI analyzes methodology against official curriculum
                standards to provide high-fidelity feedback.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        {!isCompact && (
          <div className='flex items-center gap-3 h-3'>
            <p className='text-[9px] text-muted-foreground/60 font-mono tracking-wider flex items-center gap-1.5 uppercase'>
              {totalTokensSession > 0 ? (
                <>
                  <span className='opacity-40'>Tokens</span>
                  <span className='font-bold text-foreground/70'>
                    {totalTokensSession.toLocaleString()}
                  </span>
                  <span className='opacity-20'>|</span>
                  <span className='font-bold text-foreground/70'>
                    ${totalCostSession.toFixed(4)}
                  </span>
                </>
              ) : (
                <>
                  <span className='opacity-40'>Tokens</span>
                  <span className='font-bold text-foreground/70'>0</span>
                  <span className='opacity-20'>|</span>
                  <span className='font-bold text-foreground/70'>$0.0000</span>
                </>
              )}
            </p>
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
          clearSession(questionId);
        }}
        title='New Chat'
      >
        <MessageSquarePlus className='h-4 w-4' />
      </Button>
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
          isCompact
            ? 'Standard View (Cmd+Shift+M)'
            : 'Compact View (Cmd+Shift+M)'
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
        className={cn(
          'rounded-full hover:bg-muted transition-all active:scale-90',
          showContext && 'text-primary',
          isCompact ? 'h-7 w-7' : 'h-8 w-8',
        )}
        onClick={onToggleContext}
        title={showContext ? 'Hide Context' : 'Show Context'}
      >
        <Eye className='h-4 w-4' />
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

const MsgUserActions = ({
  msgId,
  textContent,
  onEdit,
}: {
  msgId: string;
  textContent: string;
  onEdit: (id: string, content: string) => void;
}) => (
  <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 mr-1 mt-0.5'>
    <button
      onClick={() => onEdit(msgId, textContent)}
      className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90'
      title='Edit message'
    >
      <Pencil className='h-3.5 w-3.5' />
    </button>
  </div>
);

const MsgAssistantActions = ({
  msg,
  textContent,
  copiedId,
  isLastAssistant,
  onCopy,
  onFeedback,
  onRegenerate,
}: {
  msg: { id: string; feedback?: 'up' | 'down' | null };
  textContent: string;
  copiedId: string | null;
  isLastAssistant?: boolean;
  onCopy: (id: string, content: string, type?: 'text' | 'md') => void;
  onFeedback: (id: string, feedback: 'up' | 'down') => void;
  onRegenerate: () => void;
}) => (
  <div className='flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 ml-1 mt-0.5'>
    <button
      onClick={() => onCopy(msg.id, textContent, 'text')}
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
      onClick={() => onCopy(msg.id, textContent, 'md')}
      className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90'
      title='Copy Markdown source'
    >
      {copiedId === `${msg.id}-md` ? (
        <ClipboardCheck className='h-3.5 w-3.5 text-primary' />
      ) : (
        <FileText className='h-3.5 w-3.5' />
      )}
    </button>
    <button
      onClick={() => onFeedback(msg.id, 'up')}
      className={cn(
        'p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90',
        msg.feedback === 'up' && 'text-primary hover:text-primary',
      )}
      title='Helpful response'
    >
      <ThumbsUp
        className={cn(
          'h-3.5 w-3.5',
          msg.feedback === 'up' && 'fill-current text-primary',
        )}
      />
    </button>
    <button
      onClick={() => onFeedback(msg.id, 'down')}
      className={cn(
        'p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90',
        msg.feedback === 'down' && 'text-destructive hover:text-destructive',
      )}
      title='Needs improvement'
    >
      <ThumbsDown
        className={cn(
          'h-3.5 w-3.5',
          msg.feedback === 'down' && 'fill-current text-destructive',
        )}
      />
    </button>
    {isLastAssistant && (
      <button
        onClick={() => onRegenerate()}
        className='p-1.5 hover:bg-muted rounded-md text-muted-foreground transition-all hover:text-foreground active:scale-90'
        title='Regenerate response'
      >
        <RefreshCcw className='h-3.5 w-3.5 text-muted-foreground hover:text-primary transition-colors' />
      </button>
    )}
  </div>
);

const MessageItem = ({
  msg,
  copiedId,
  isCompact,
  handleCopyMessage,
  handleRegenerate,
  handleEditMessage,
  handleFeedback,
  isLastAssistant,
}: {
  msg: {
    id: string;
    role: string;
    content: string | TutorApiContentPart[];
    feedback?: 'up' | 'down' | null;
  };
  copiedId: string | null;
  isCompact: boolean;
  handleCopyMessage: (
    id: string,
    content: string,
    type?: 'text' | 'md',
  ) => void;
  handleRegenerate: () => void;
  handleEditMessage: (id: string, content: string) => void;
  handleFeedback: (id: string, feedback: 'up' | 'down') => void;
  isLastAssistant?: boolean;
}) => {
  const textContent = useMemo(() => {
    if (typeof msg.content === 'string') return msg.content;
    return msg.content
      .filter(
        (part): part is { type: 'text'; text: string } => part.type === 'text',
      )
      .map((part) => part.text)
      .join('\n');
  }, [msg.content]);

  const hasImages = useMemo(() => {
    if (typeof msg.content === 'string') return false;
    return msg.content.some((part) => part.type === 'image_url');
  }, [msg.content]);

  const imageUrls = useMemo(() => {
    if (typeof msg.content === 'string') return [];
    return msg.content
      .filter(
        (part): part is { type: 'image_url'; image_url: { url: string } } =>
          part.type === 'image_url',
      )
      .map((part) => part.image_url.url);
  }, [msg.content]);

  return (
    <div
      className={cn(
        'flex flex-col space-y-1.5 animate-in fade-in slide-in-from-bottom-3 duration-500 group min-w-0',
        msg.role === 'assistant'
          ? isCompact
            ? 'max-w-[88%]'
            : 'max-w-[85%]'
          : isCompact
            ? 'max-w-[92%]'
            : 'max-w-[88%]',
        msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start',
      )}
    >
      <div
        className={cn(
          'rounded-2xl leading-relaxed min-w-0 overflow-hidden transition-all duration-300 border',
          isCompact ? 'px-4 py-2.5 text-[13px]' : 'px-5 py-3.5 text-sm',
          msg.role === 'user'
            ? 'bg-primary/5 border-primary/20 text-foreground rounded-tr-none'
            : 'bg-card/60 border-border/50 backdrop-blur-md rounded-tl-none shadow-sm',
        )}
      >
        <div
          className={cn(
            'min-w-0 [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_.katex-display]:max-w-full [&_.math-display]:overflow-x-auto [&_.math-display]:max-w-full',
            msg.role === 'user'
              ? 'text-foreground [&_.math-inline]:text-primary [&_.math-display]:text-primary'
              : 'leading-relaxed text-foreground/85',
          )}
        >
          <MarkdownMath content={textContent} />
          {imageUrls.length > 0 && (
            <div className='mt-3 flex flex-wrap gap-2'>
              {imageUrls.map((url, idx) => (
                <div
                  key={idx}
                  className='relative group/img rounded-lg overflow-hidden border border-white/20 shadow-sm bg-black/5'
                >
                  <img
                    src={url}
                    alt={`Attachment ${idx + 1}`}
                    className='max-w-full h-auto max-h-48 object-contain'
                  />
                </div>
              ))}
            </div>
          )}
          {hasImages && msg.role === 'user' && (
            <div className='mt-2 flex gap-1.5 opacity-80'>
              <span className='text-[10px] font-bold uppercase tracking-wider bg-white/20 px-1.5 py-0.5 rounded'>
                Sketches/Images Included
              </span>
            </div>
          )}
        </div>
      </div>

      {msg.role === 'user' && (
        <MsgUserActions
          msgId={msg.id}
          textContent={textContent}
          onEdit={handleEditMessage}
        />
      )}

      {msg.role === 'assistant' && (
        <MsgAssistantActions
          msg={msg}
          textContent={textContent}
          copiedId={copiedId}
          isLastAssistant={isLastAssistant}
          onCopy={handleCopyMessage}
          onFeedback={handleFeedback}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  );
};

const TutorEmptyState = ({
  onSuggestion,
  hasStudentAnswer = false,
}: {
  isCompact: boolean;
  hasStudentAnswer?: boolean;
  onSuggestion: (s: string) => void;
}) => {
  const description = hasStudentAnswer
    ? 'The tutor can evaluate your response, pinpoint what needs correction, and guide your next revision for this VCE problem.'
    : 'The tutor can explain the core concept, walk you through the method, and offer strategic hints for this VCE problem.';

  const suggestions = hasStudentAnswer
    ? [
        { text: 'Check my answer', icon: Check },
        { text: 'Explain where I went wrong', icon: Activity },
        { text: 'Give me a hint', icon: Sparkles },
      ]
    : [
        { text: 'Explain the concept', icon: Brain },
        { text: 'Walk me through this', icon: Activity },
        { text: 'Give me a strategy hint', icon: PencilRuler },
      ];

  return (
    <div className='flex flex-col items-center justify-center text-center space-y-8 px-8 max-w-sm mx-auto'>
      <div className='space-y-8 pt-12'>
        <p className='font-bold'>Tutor Chat</p>
        <p className='text-[11px] text-muted-foreground/80 leading-relaxed font-medium'>
          {description}
        </p>
      </div>
      <div className='flex flex-col gap-2 w-full pt-2'>
        {suggestions.map((suggestion) => (
          <button
            aria-label={`Send suggestion: ${suggestion.text}`}
            key={suggestion.text}
            onClick={() => onSuggestion(suggestion.text)}
            className='text-[9px] font-bold px-4 py-2.5 rounded-xl text-muted-foreground border border-border/40 hover:border-primary/30 hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-between group'
          >
            <span className='tracking-widest'>
              {suggestion.text.toUpperCase()}
            </span>
            <suggestion.icon className='h-3 w-3 opacity-40 group-hover:opacity-100 transition-opacity' />
          </button>
        ))}
      </div>
    </div>
  );
};

const TutorContextPanel = ({
  activePersona,
  contextPrompt,
  studentAnswer,
  image,
  isCompact,
}: {
  activePersona: string;
  contextPrompt: string;
  studentAnswer?: string;
  image?: { dataUrl?: string };
  isCompact: boolean;
}) => {
  const sections = [
    {
      label: 'Tutor Persona',
      value: activePersona.trim() || 'None',
    },
    {
      label: 'Question Context',
      value: contextPrompt.trim() || 'None',
    },
    {
      label: 'Student Answer',
      value: studentAnswer?.trim() || 'None',
    },
    {
      label: 'Attachments',
      value: image?.dataUrl ? '1 image attached' : 'None',
    },
  ];

  return (
    <div
      className={cn(
        'border-b border-border/30 bg-muted/10 px-6 py-4 space-y-3 text-xs',
        isCompact && 'px-4 py-3',
      )}
    >
      <h4 className='text-[10px] uppercase tracking-widest text-muted-foreground font-bold'>
        What the AI Sees
      </h4>
      <div className='space-y-2'>
        {sections.map((section) => (
          <div key={section.label} className='space-y-1 min-w-0'>
            <p className='text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70 font-semibold'>
              {section.label}
            </p>
            <p className='text-[11px] text-muted-foreground/90 font-medium truncate'>
              {section.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

const FOLLOW_UP_SUGGESTIONS = [
  'Can you explain that differently?',
  'Give me a simpler example',
  "What's the key concept here?",
] as const;

const TutorFollowUpSuggestions = ({
  onSuggestion,
  isCompact,
}: {
  onSuggestion: (s: string) => void;
  isCompact: boolean;
}) => (
  <div className={cn('pt-2 flex flex-wrap gap-2', isCompact && 'gap-1.5')}>
    {FOLLOW_UP_SUGGESTIONS.map((suggestion) => (
      <button
        key={suggestion}
        type='button'
        onClick={() => onSuggestion(suggestion)}
        className='text-[10px] px-3 py-1.5 rounded-full border border-border/30 hover:border-primary/30 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-all'
      >
        {suggestion}
      </button>
    ))}
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
  messages: { role: string; content: string | TutorApiContentPart[] }[];
  image?: StudentAnswerImage;
  sketchpadDataUrl?: string;
  apiKey: string;
  baseUrl?: string;
  providerId?: string;
  isDiagnostic: boolean;
  currentRequestParts?: TutorApiContentPart[];
  appendUserMessage?: boolean;
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
    baseUrl,
    providerId,
    isDiagnostic,
    currentRequestParts,
    appendUserMessage = true,
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
  if (
    image?.dataUrl ||
    sketchpadDataUrl ||
    currentRequestParts?.some((p) => p.type === 'image_url')
  ) {
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
  if (appendUserMessage) {
    if (currentRequestParts) {
      apiMessages.push({
        role: 'user',
        content: currentRequestParts,
      });
    } else {
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
    }
  }

  // Call backend
  return await invoke<TutorChatResponse>('tutor_chat', {
    request: {
      messages: apiMessages,
      model: activeModel,
      apiKey: apiKey,
      baseUrl,
      providerId,
      diagnostic: isDiagnostic,
    },
  });
}

const TutorChatArea = ({
  messages,
  isGenerating,
  isCompact,
  activePersona,
  contextPrompt,
  studentAnswer,
  image,
  showContext,
  onToggleContext: _onToggleContext,
  streamedContent,
  sketchStatus,
  copiedId,
  showScrollButton,
  scrollAreaRef,
  messagesEndRef,
  handleCopyMessage,
  handleRegenerate,
  handleEditMessage,
  handleFeedback,
  handleSend,
  scrollToBottom,
  setShowScrollButton,
}: {
  messages: {
    id: string;
    role: string;
    content: string | TutorApiContentPart[];
    createdAt: number;
  }[];
  isGenerating: boolean;
  isCompact: boolean;
  activePersona: string;
  contextPrompt: string;
  studentAnswer?: string;
  image?: { dataUrl?: string };
  showContext: boolean;
  onToggleContext: () => void;
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
  handleEditMessage: (id: string, content: string) => void;
  handleFeedback: (id: string, feedback: 'up' | 'down') => void;
  handleSend: (content: string) => void;
  scrollToBottom: () => void;
  setShowScrollButton: (show: boolean) => void;
}) => (
  <ScrollArea
    ref={scrollAreaRef}
    className='flex-1 min-h-0 bg-background/20 relative'
  >
    <div className='flex flex-col min-h-full'>
      {showContext && (
        <TutorContextPanel
          activePersona={activePersona}
          contextPrompt={contextPrompt}
          studentAnswer={studentAnswer}
          image={image}
          isCompact={isCompact}
        />
      )}

      {messages.length === 0 && !isGenerating ? (
        <div className='flex-1 flex flex-col items-center justify-center p-6'>
          <TutorEmptyState
            isCompact={isCompact}
            hasStudentAnswer={Boolean(studentAnswer?.trim())}
            onSuggestion={(s) => void handleSend(s)}
          />
        </div>
      ) : (
        <div className='flex-1 flex flex-col justify-end p-6 space-y-8'>
          <div className='flex-1' />
          <TutorMessageList
            messages={messages}
            isCompact={isCompact}
            isGenerating={isGenerating}
            copiedId={copiedId}
            handleCopyMessage={handleCopyMessage}
            handleRegenerate={handleRegenerate}
            handleEditMessage={handleEditMessage}
            handleFeedback={handleFeedback}
          />

          <TutorStreamingChunk
            isGenerating={isGenerating}
            isCompact={isCompact}
            streamedContent={streamedContent}
            sketchStatus={sketchStatus}
          />

          {messages.length > 0 && !isGenerating && (
            <TutorFollowUpSuggestions
              onSuggestion={(s) => void handleSend(s)}
              isCompact={isCompact}
            />
          )}
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
        'flex flex-col mr-auto items-start space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-400 min-w-0',
        isCompact ? 'max-w-[88%]' : 'max-w-[85%]',
      )}
    >
      <div
        className={cn(
          'rounded-2xl leading-relaxed bg-card/60 border border-border/50 backdrop-blur-md rounded-tl-none shadow-sm min-w-16 overflow-hidden transition-all duration-300',
          isCompact ? 'px-4 py-2.5 text-[13px]' : 'px-5 py-3.5 text-sm',
        )}
      >
        {streamedContent ? (
          <div className='leading-relaxed text-foreground/85'>
            <MarkdownMath content={streamedContent + ' ▋'} isStreaming />
          </div>
        ) : (
          <div className='flex flex-col gap-3 py-1.5'>
            <div className='flex gap-2 ml-0.5'>
              {[0, 0.2, 0.4].map((delay) => (
                <motion.div
                  key={delay}
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.7, 0.3],
                  }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.4,
                    times: [0, 0.5, 1],
                    delay,
                  }}
                  className='h-1 w-1 bg-primary/40 rounded-full'
                />
              ))}
            </div>
            <span className='text-[9px] uppercase tracking-[0.2em] text-muted-foreground/60 animate-pulse font-bold'>
              {sketchStatus === 'sending'
                ? 'Uploading Context...'
                : 'Formulating Response...'}
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
  copiedId,
  handleCopyMessage,
  handleRegenerate,
  handleEditMessage,
  handleFeedback,
}: {
  messages: {
    id: string;
    role: string;
    content: string | TutorApiContentPart[];
    createdAt: number;
    feedback?: 'up' | 'down' | null;
  }[];
  isCompact: boolean;
  isGenerating: boolean;
  copiedId: string | null;
  handleCopyMessage: (
    id: string,
    content: string,
    type?: 'text' | 'md',
  ) => void;
  handleRegenerate: () => void;
  handleEditMessage: (id: string, content: string) => void;
  handleFeedback: (id: string, feedback: 'up' | 'down') => void;
}) => {
  let lastAssistantId: string | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') {
      lastAssistantId = messages[i].id;
      break;
    }
  }

  return (
    <>
      {messages.map((m) => (
        <React.Fragment key={m.id}>
          <MessageItem
            msg={m}
            copiedId={copiedId}
            isCompact={isCompact}
            handleCopyMessage={handleCopyMessage}
            handleRegenerate={handleRegenerate}
            handleEditMessage={handleEditMessage}
            handleFeedback={handleFeedback}
            isLastAssistant={m.role === 'assistant' && m.id === lastAssistantId}
          />
        </React.Fragment>
      ))}
    </>
  );
};

const TutorInputArea = ({
  isCompact,
  isGenerating,
  inputValue,
  includeSketch,
  sketchStatus,
  image,
  setInputValue,
  setIncludeSketch,
  handleSend,
  handleStop,
  handleKeyDown,
  handleDiagnosticRequest,
}: {
  isCompact: boolean;
  isGenerating: boolean;
  inputValue: string;
  includeSketch: boolean;
  sketchStatus: string;
  image?: StudentAnswerImage;
  messages: {
    id: string;
    role: string;
    content: string | TutorApiContentPart[];
    createdAt: number;
  }[];
  setInputValue: (val: string) => void;
  setIncludeSketch: (inc: boolean) => void;
  handleSend: () => void;
  handleStop: () => void;
  handleKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement>;
  handleDiagnosticRequest: () => void;
}) => (
  <div
    className={cn(
      'border-t border-border/50 bg-card/30 shrink-0 backdrop-blur-3xl transition-all',
      isCompact ? 'p-3' : 'p-5',
    )}
  >
    <TutorSketchStatus sketchStatus={sketchStatus} isCompact={isCompact} />

    <div className='relative flex items-center gap-3'>
      <div className='flex flex-row gap-2 shrink-0'>
        <Button
          variant='ghost'
          size='icon'
          className={cn(
            'shrink-0 transition-all active:scale-95 border border-transparent',
            isCompact ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl',
            includeSketch
              ? 'bg-primary/10 text-primary border-primary/30 shadow-[0_0_15px_-5px_rgba(var(--primary),0.3)] opacity-100'
              : 'text-muted-foreground/70 hover:text-foreground hover:bg-muted',
          )}
          onClick={() => setIncludeSketch(!includeSketch)}
          disabled={isGenerating}
          title={includeSketch ? 'Sketch Attached' : 'Attach Sketchpad Content'}
        >
          <div className='relative'>
            <PencilRuler className='h-4 w-4' />
            {includeSketch && (
              <motion.div
                layoutId='sketch-dot'
                className='absolute -top-1 -right-1 h-2 w-2 bg-primary rounded-full border-2 border-background'
              />
            )}
          </div>
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className={cn(
            'shrink-0 transition-all active:scale-95 border border-transparent',
            isCompact ? 'h-8 w-8 rounded-lg' : 'h-9 w-9 rounded-xl',
            'text-muted-foreground/70 hover:text-foreground hover:bg-muted',
          )}
          onClick={handleDiagnosticRequest}
          title='Check my working for errors'
        >
          <Activity className='h-4 w-4' />
        </Button>
      </div>

      <div className='flex-1 flex flex-col gap-2.5 min-w-0'>
        <TutorAttachmentPreviews image={image} />
        <div className='relative group'>
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'Ask a question or request feedback...'}
            className={cn(
              'resize-none pr-12 focus-visible:ring-primary/20 bg-background/60 border-border/50 backdrop-blur-sm transition-all overflow-hidden placeholder:text-muted-foreground/50',
              isCompact
                ? 'text-xs py-2.5 rounded-xl min-h-10 h-10'
                : 'text-sm py-3 rounded-2xl min-h-11 h-11',
              'group-hover:border-border/70 group-hover:bg-background/80 focus:bg-background/90',
            )}
          />
          <div className='absolute right-2 bottom-1.5 flex items-center gap-1.5'>
            {isGenerating ? (
              <Button
                size='icon'
                variant='ghost'
                className={cn(
                  'transition-all duration-300 active:scale-95 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive',
                  isCompact ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl',
                )}
                onClick={handleStop}
              >
                <StopCircle className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </Button>
            ) : (
              <Button
                size='icon'
                variant='ghost'
                className={cn(
                  'transition-all duration-300 active:scale-95 hover:bg-primary/10 hover:text-primary',
                  isCompact ? 'h-7 w-7 rounded-lg' : 'h-8 w-8 rounded-xl',
                  !inputValue.trim() && 'opacity-20 cursor-not-allowed',
                )}
                onClick={() => void handleSend()}
                disabled={!inputValue.trim()}
              >
                <Send className={isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);

const TutorAttachmentPreviews = ({ image }: { image?: StudentAnswerImage }) => {
  if (!image?.dataUrl) return null;

  return (
    <div className='flex items-center gap-2 animate-in fade-in slide-in-from-bottom-1 duration-400'>
      <div className='relative group'>
        <div className='w-14 h-14 rounded-xl border border-border/40 overflow-hidden shadow-sm bg-muted/20 transition-all group-hover:border-primary/30'>
          <img
            src={image.dataUrl}
            alt='Student Work'
            className='w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all'
          />
        </div>
        <div className='absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]'>
          <span className='text-[8px] font-bold text-primary tracking-[0.2em] uppercase'>
            Context
          </span>
        </div>
        <div className='absolute -top-1.5 -right-1.5 h-4 w-4 bg-primary rounded-full flex items-center justify-center shadow-sm border-2 border-background'>
          <Check className='h-2.5 w-2.5 text-primary-foreground' />
        </div>
      </div>
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
        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
        animate={{
          opacity: 1,
          height: 'auto',
          marginBottom: isCompact ? 8 : 12,
        }}
        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        className='overflow-hidden'
      >
        <div className='flex items-center gap-2 px-1'>
          <div className='flex items-center gap-2 bg-primary/5 border border-primary/10 rounded-full px-3 py-1'>
            {sketchStatus === 'processing' ? (
              <Loader2 className='h-2.5 w-2.5 animate-spin text-primary' />
            ) : (
              <Activity className='h-2.5 w-2.5 text-primary animate-pulse' />
            )}
            <span className='font-mono uppercase tracking-[0.15em] text-[9px] text-primary/80 font-bold'>
              {sketchStatus === 'processing'
                ? 'Syncing Canvas'
                : 'Uploading Context'}
            </span>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

function calculateTutorMetrics(result: TutorChatResponse) {
  const totalTokens = result.total_tokens ?? result.totalTokens ?? 0;
  const cost = result.estimated_cost_usd ?? result.estimatedCostUsd ?? 0;
  return { totalTokens, cost };
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
          className='h-9 w-9 rounded-full shadow-lg border border-border/40 bg-background/80 backdrop-blur-md hover:bg-background transition-all active:scale-90'
          onClick={onClick}
        >
          <ChevronDown className='h-5 w-5' />
        </Button>
      </motion.div>
    )}
  </AnimatePresence>
);

const TutorBranchNav = ({
  branches,
  activeBranchId,
  onSwitchBranch,
  isCompact,
}: {
  branches: Record<string, unknown>;
  activeBranchId: string | null;
  onSwitchBranch: (branchId: string | null) => void;
  isCompact: boolean;
}) => {
  const branchIds = Object.keys(branches);
  const totalBranches = branchIds.length;

  if (totalBranches === 0) return null;

  const allBranchIds = ['__main__', ...branchIds];
  const currentBranchId = activeBranchId ?? '__main__';
  const currentIndex = allBranchIds.indexOf(currentBranchId);
  const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;

  const switchToIndex = (index: number) => {
    const targetBranchId = allBranchIds[index];
    onSwitchBranch(targetBranchId === '__main__' ? null : targetBranchId);
  };

  const prevBranch = () => {
    const prevIndex =
      (safeCurrentIndex - 1 + allBranchIds.length) % allBranchIds.length;
    switchToIndex(prevIndex);
  };

  const nextBranch = () => {
    const nextIndex = (safeCurrentIndex + 1) % allBranchIds.length;
    switchToIndex(nextIndex);
  };

  const currentBranchIndex = activeBranchId
    ? Math.max(0, branchIds.indexOf(activeBranchId))
    : -1;

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 border-t border-border/30 bg-muted/10',
        isCompact ? 'px-3 py-1.5' : 'px-4 py-2',
      )}
    >
      <button
        type='button'
        onClick={prevBranch}
        className='p-1 hover:bg-muted rounded'
      >
        <ArrowLeft className='h-3 w-3' />
      </button>
      <span className='text-[10px] text-muted-foreground font-mono'>
        {activeBranchId
          ? `Branch ${currentBranchIndex + 1} of ${totalBranches}`
          : `Main · ${totalBranches} branch${totalBranches > 1 ? 'es' : ''}`}
      </span>
      <button
        type='button'
        onClick={nextBranch}
        className='p-1 hover:bg-muted rounded'
      >
        <ArrowRight className='h-3 w-3' />
      </button>
      {activeBranchId && (
        <button
          type='button'
          onClick={() => onSwitchBranch(null)}
          className='text-[9px] text-primary hover:underline ml-1'
        >
          Back to main
        </button>
      )}
    </div>
  );
};
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
    setMessageFeedback,
    createBranch,
    updateSessionOverrides,
    clearSession,
    switchBranch,
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
      setMessageFeedback: s.setMessageFeedback,
      createBranch: s.createBranch,
      updateSessionOverrides: s.updateSessionOverrides,
      clearSession: s.clearSession,
      switchBranch: s.switchBranch,
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

  const effectiveSessionKey = sketchSessionKey || questionId;

  const { tutorModel, tutorPersona } = useAppSettings();
  const providers = useAppStore((s) => s.providers);
  const activeProviderId = useAppStore((s) => s.activeProviderId);
  const [inputValue, setInputValue] = useState('');
  const [includeSketch, setIncludeSketch] = useState(false);
  const [sketchStatus, setSketchStatus] = useState<
    'idle' | 'processing' | 'sending' | 'none'
  >('idle');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [dynamicPanelWidth, setDynamicPanelWidth] = useState<number | null>(
    null,
  );
  const [lastLayoutUpdate, setLastLayoutUpdate] = useState(0);

  const session = sessions[questionId];
  const messages = useMemo(() => session?.messages || [], [session]);

  // Current model/persona (with session-specific overrides)
  const activeModel = session?.modelOverride || tutorModel;
  const activePersona = session?.personaOverride || tutorPersona;

  // Helper to get friendly model name with provider badge
  const modelName = useMemo(() => {
    if (!activeModel) return '';
    const preset = [...PRESET_MODELS, ...PRESET_IMAGE_MODELS].find(
      (m) => m.id === activeModel,
    );
    const name = preset
      ? preset.name
      : activeModel.split('/').pop() || activeModel;
    // Resolve via providers + activeProviderId so NVIDIA / custom models
    // stop mis-labelling as OpenRouter.
    const provider = getProviderLabelForModel(
      activeModel,
      providers,
      activeProviderId,
    );
    return provider ? `${name}  ·  ${provider}` : name;
  }, [activeModel, providers, activeProviderId]);

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

  const handleEditMessage = (_id: string, content: string) => {
    setInputValue(content);
  };

  const handleFeedback = (id: string, feedback: 'up' | 'down') => {
    const currentFeedback = messages.find(
      (message) => message.id === id,
    )?.feedback;
    setMessageFeedback(
      questionId,
      id,
      currentFeedback === feedback ? null : feedback,
    );
  };

  const handleExportTranscript = () => {
    void (async () => {
      if (!messages.length) return;

      try {
        const transcript = messages
          .map((m) => {
            const date = new Date(m.createdAt).toLocaleString();
            const role = m.role === 'user' ? 'Student' : 'Tutor';
            const content =
              typeof m.content === 'string'
                ? m.content
                : (m.content as TutorApiContentPart[])
                    .filter((p) => p.type === 'text')
                    .map((p) => (p as { text: string }).text)
                    .join('\n');

            return `### ${role} (${date})\n\n${content}\n\n---`;
          })
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

  const isTutorContentNonEmpty = (content: string | TutorApiContentPart[]) =>
    typeof content === 'string'
      ? content.trim().length > 0
      : content.some(
          (part) => part.type === 'text' && part.text.trim().length > 0,
        );

  const getTutorContentText = (content: string | TutorApiContentPart[]) => {
    if (typeof content === 'string') return content;

    return content.find((part) => part.type === 'text')?.text || '';
  };

  const loadTutorSketchpadDataUrl = async (
    input: string | TutorApiContentPart[],
    appendUserMessage: boolean,
  ): Promise<string | undefined> => {
    if (
      !appendUserMessage ||
      !includeSketch ||
      !effectiveSessionKey ||
      typeof input !== 'string'
    ) {
      return undefined;
    }

    // Always export fresh from the live canvas at send time — never use sketchDataUrl
    // state, which was captured at "Attach Sketch" button press and may be stale.
    const retrieveLatestSketch = getLatestSketch;
    const dataUrl = await retrieveLatestSketch(effectiveSessionKey, {
      forceLightTheme: true,
    });
    return dataUrl;
  };

  const buildTutorRequestDetails = (
    input: string | TutorApiContentPart[],
    sketchpadDataUrl: string | undefined,
    appendUserMessage: boolean,
  ) => {
    if (!appendUserMessage) {
      return {
        effectiveUserContent: getTutorContentText(input),
        currentRequestParts: undefined,
      };
    }

    return prepareRequestParts(input, image?.dataUrl, sketchpadDataUrl);
  };

  const submitTutorChat = async ({
    input,
    historyMessages = messages,
    isDiagnostic = false,
    storeUserMessage = true,
    appendUserMessage = true,
  }: {
    input: string | TutorApiContentPart[];
    historyMessages?: {
      role: string;
      content: string | TutorApiContentPart[];
    }[];
    isDiagnostic?: boolean;
    storeUserMessage?: boolean;
    appendUserMessage?: boolean;
  }) => {
    if (!isTutorContentNonEmpty(input) || isGenerating) return;

    if (storeUserMessage && typeof input === 'string' && input === inputValue) {
      setInputValue('');
    }

    setIsGenerating(true);
    setStreamedContent('');

    try {
      // (debug log removed)
      setSketchStatus('processing');

      const sketchpadDataUrl = await loadTutorSketchpadDataUrl(
        input,
        appendUserMessage,
      );
      if (includeSketch && !sketchpadDataUrl) {
        toast.error('Failed to capture sketch. Is the sketchpad active?');
      }
      setSketchStatus(sketchpadDataUrl ? 'sending' : 'none');

      if (storeUserMessage) {
        const contentToStore = prepareContentToStore(
          input,
          image?.dataUrl,
          sketchpadDataUrl,
        );
        addMessage(questionId, {
          id: crypto.randomUUID(),
          role: 'user',
          content: contentToStore,
          createdAt: Date.now(),
        });
      }

      const { effectiveUserContent, currentRequestParts } =
        buildTutorRequestDetails(input, sketchpadDataUrl, appendUserMessage);

      // Resolve API credentials based on the model ID (not the active provider)
      const credentials = getModelCredentials(activeModel, providers);
      if (!credentials) {
        toast.error(
          'No valid API credentials configured for the selected model',
        );
        setIsGenerating(false);
        setSketchStatus('idle');
        setStreamedContent('');
        return;
      }

      const result = await performTutorChat({
        activeModel: credentials.modelId,
        activePersona,
        contextPrompt,
        studentAnswer,
        userMessageContent: effectiveUserContent,
        messages: historyMessages,
        image,
        sketchpadDataUrl,
        apiKey: credentials.apiKey,
        baseUrl: credentials.baseUrl,
        providerId: credentials.providerId,
        isDiagnostic,
        currentRequestParts,
        appendUserMessage,
      });

      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        createdAt: Date.now(),
      });

      const { totalTokens, cost } = calculateTutorMetrics(result);
      updateMetrics(totalTokens, cost);
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
      widestMath = Math.max(
        widestMath,
        (measureTarget as HTMLElement).scrollWidth,
      );
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

  const prepareContentToStore = (
    input: string | TutorApiContentPart[],
    imageUrl?: string,
    sketchUrl?: string,
  ): string | TutorApiContentPart[] => {
    if (Array.isArray(input)) return input;

    const parts: TutorApiContentPart[] = [{ type: 'text', text: input }];
    if (imageUrl)
      parts.push({ type: 'image_url', image_url: { url: imageUrl } });
    if (sketchUrl)
      parts.push({ type: 'image_url', image_url: { url: sketchUrl } });

    return parts.length > 1 ? parts : input;
  };

  const prepareRequestParts = (
    input: string | TutorApiContentPart[],
    imageUrl?: string,
    sketchUrl?: string,
  ) => {
    if (Array.isArray(input)) {
      return {
        effectiveUserContent: input.find((p) => p.type === 'text')?.text || '',
        currentRequestParts: input,
      };
    }

    const currentRequestParts: TutorApiContentPart[] = [
      { type: 'text', text: input },
    ];
    if (imageUrl) {
      currentRequestParts.push({
        type: 'image_url',
        image_url: { url: imageUrl },
      });
    }
    if (sketchUrl) {
      currentRequestParts.push({
        type: 'image_url',
        image_url: { url: sketchUrl },
      });
    }

    return {
      effectiveUserContent: input,
      currentRequestParts,
    };
  };

  const handleSend = async (
    overrideValue?: string | TutorApiContentPart[],
    isDiagnostic = false,
  ) => {
    await submitTutorChat({
      input: overrideValue ?? inputValue,
      isDiagnostic,
      storeUserMessage: true,
      appendUserMessage: true,
    });
  };

  const handleRegenerate = () => {
    const lastMessage = messages[messages.length - 1];
    const previousMessage = messages[messages.length - 2];

    if (
      !lastMessage ||
      lastMessage.role !== 'assistant' ||
      !previousMessage ||
      previousMessage.role !== 'user'
    ) {
      return;
    }

    // Save the last user+assistant pair into a branch before regenerating
    createBranch(questionId);
    void submitTutorChat({
      input: previousMessage.content,
      historyMessages: messages.slice(0, -2),
      storeUserMessage: false,
      appendUserMessage: false,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void handleSend();
  };

  const handleStop = () => {
    void invoke('abort_generation');
  };

  const handleDiagnosticRequest = () => {
    void handleSend(
      'Please analyze my working and point out any errors.',
      true,
    );
  };

  const toggleContextVisibility = () => {
    setShowContext((prev) => !prev);
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className='fixed bottom-6 right-6 z-50'
          >
            <Button
              onClick={() => setIsOpen(true)}
              size='icon'
              className='h-14 w-14 rounded-full shadow-2xl bg-primary hover:bg-primary/90 text-primary-foreground group transition-all hover:scale-110 active:scale-95'
              title='Open AI Tutor'
            >
              <Sparkles className='h-6 w-6 group-hover:rotate-12 transition-transform' />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className={cn(
          'fixed top-4 bottom-4 right-4 z-50 flex flex-col bg-background/95 border border-border/60 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-xl transition-all duration-300 ease-in-out',
          !isOpen && 'translate-x-[calc(100%+2rem)] pointer-events-none',
          className,
        )}
        style={{
          width: dynamicPanelWidth || (isCompact ? 416 : 512),
        }}
      >
        <TutorHeader
          modelName={modelName}
          totalTokensSession={totalTokensSession}
          totalCostSession={totalCostSession}
          activeModel={activeModel}
          activePersona={activePersona}
          questionId={questionId}
          isCompact={isCompact}
          showContext={showContext}
          onToggleContext={toggleContextVisibility}
          setIsOpen={setIsOpen}
          toggleCompact={toggleCompact}
          updateSessionOverrides={updateSessionOverrides}
          clearSession={clearSession}
          handleExportTranscript={handleExportTranscript}
          studentAnswer={studentAnswer}
          providers={providers}
          activeProviderId={activeProviderId}
        />

        <TutorChatArea
          messages={messages}
          isGenerating={isGenerating}
          isCompact={isCompact}
          activePersona={activePersona}
          contextPrompt={contextPrompt}
          studentAnswer={studentAnswer}
          image={image}
          showContext={showContext}
          onToggleContext={toggleContextVisibility}
          streamedContent={streamedContent}
          sketchStatus={sketchStatus}
          copiedId={copiedId}
          showScrollButton={showScrollButton}
          scrollAreaRef={scrollAreaRef}
          messagesEndRef={messagesEndRef}
          handleCopyMessage={handleCopyMessage}
          handleRegenerate={() => void handleRegenerate()}
          handleEditMessage={handleEditMessage}
          handleFeedback={handleFeedback}
          handleSend={(content) => void handleSend(content)}
          scrollToBottom={scrollToBottom}
          setShowScrollButton={setShowScrollButton}
        />

        <TutorBranchNav
          branches={session?.branches ?? {}}
          activeBranchId={session?.activeBranchId ?? null}
          onSwitchBranch={(branchId) => switchBranch(questionId, branchId)}
          isCompact={isCompact}
        />
        <TutorInputArea
          isCompact={isCompact}
          isGenerating={isGenerating}
          inputValue={inputValue}
          includeSketch={includeSketch}
          sketchStatus={sketchStatus}
          image={image}
          messages={messages}
          setInputValue={setInputValue}
          setIncludeSketch={setIncludeSketch}
          handleSend={() => {
            void handleSend();
          }}
          handleKeyDown={handleKeyDown}
          handleDiagnosticRequest={handleDiagnosticRequest}
          handleStop={handleStop}
        />
      </div>
    </>
  );
}
