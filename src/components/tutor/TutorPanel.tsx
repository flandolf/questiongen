import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Loader2, Send, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useAppSettings } from '@/AppContext';
import { MarkdownMath } from '@/components/MarkdownMath';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useTutorStore } from '@/store/tutor';
import { PRESET_IMAGE_MODELS, PRESET_MODELS } from '@/views/settings/constants';

interface TutorPanelProps {
  questionId: string;
  contextPrompt: string;
  studentAnswer?: string;
  className?: string;
}

interface TutorChatResponse {
  content: string;
  total_tokens: number;
}

export function TutorPanel({
  questionId,
  contextPrompt,
  studentAnswer,
  className,
}: TutorPanelProps) {
  const {
    isOpen,
    setIsOpen,
    sessions,
    addMessage,
    isGenerating,
    setIsGenerating,
    streamedContent,
    setStreamedContent,
    appendStreamedContent,
    totalCostSession,
    totalTokensSession,
    updateMetrics,
  } = useTutorStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      setIsOpen: s.setIsOpen,
      sessions: s.sessions,
      addMessage: s.addMessage,
      isGenerating: s.isGenerating,
      setIsGenerating: s.setIsGenerating,
      streamedContent: s.streamedContent,
      setStreamedContent: s.setStreamedContent,
      appendStreamedContent: s.appendStreamedContent,
      totalCostSession: s.totalCostSession,
      totalTokensSession: s.totalTokensSession,
      updateMetrics: s.updateMetrics,
    }))
  );

  const { apiKey, tutorModel, tutorPersona } = useAppSettings();
  const [inputValue, setInputValue] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Helper to get friendly model name
  const modelName = React.useMemo(() => {
    if (!tutorModel) return '';
    const preset = [...PRESET_MODELS, ...PRESET_IMAGE_MODELS].find(
      (m) => m.id === tutorModel
    );
    if (preset) return preset.name;
    return tutorModel.split('/').pop() || tutorModel;
  }, [tutorModel]);

  const session = sessions[questionId];
  const messages = React.useMemo(() => session?.messages || [], [session]);

  // Scroll to bottom when messages or stream changes
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current;
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }
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

  const handleSend = async () => {
    if (!inputValue.trim() || isGenerating) return;

    const userMessageContent = inputValue;
    setInputValue('');

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
      // Build full conversation history for the API
      const apiMessages = [];

      const basePersona =
        tutorPersona ||
        'You are a helpful VCE tutor. Guide the student step-by-step using the Socratic method. Do not give away the final answer immediately.';
      const formattingInstructions =
        '\n\nIMPORTANT FORMATTING RULES:\n- Format math expressions using LaTeX.\n- Use single $...$ delimiters for inline math (e.g., $x^2 + y^2 = r^2$).\n- Use double $$...$$ delimiters for block/display math.\n- Format your response using Markdown (bold, italic, bullet points, etc.).';

      // 1. System Persona
      apiMessages.push({
        role: 'system',
        content: basePersona + formattingInstructions,
      });

      // 2. Question Context (Always include as system context)
      let contextMsg = `Here is the question the student is working on:\n${contextPrompt}`;
      if (studentAnswer) {
        contextMsg += `\n\nHere is the student's current working/answer:\n${studentAnswer}`;
      }
      apiMessages.push({
        role: 'system',
        content: contextMsg,
      });

      // 3. Conversation History
      messages.forEach((m) => {
        apiMessages.push({
          role: m.role,
          content: m.content,
        });
      });

      // 4. New User Message
      apiMessages.push({
        role: 'user',
        content: userMessageContent,
      });

      // Call backend
      const result = await invoke<TutorChatResponse>('tutor_chat', {
        request: {
          messages: apiMessages,
          model: tutorModel,
          apiKey: apiKey,
        },
      });

      // Add assistant message to store
      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: result.content,
        createdAt: Date.now(),
      });

      // Update metrics (mock cost calculation for now, can be refined based on model)
      const mockCost = result.total_tokens * 0.000005; // Rough estimate
      updateMetrics(result.total_tokens, mockCost);
    } catch (error) {
      console.error('Tutor chat error:', error);
      addMessage(questionId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          'Sorry, I encountered an error connecting to the tutor service.',
        createdAt: Date.now(),
      });
    } finally {
      setIsGenerating(false);
      setStreamedContent('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-card border-l border-border w-80 shrink-0 shadow-lg',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
        <div>
          <h3 className="font-semibold text-xs flex items-center gap-1.5">
            AI Tutor
            {modelName && (
              <span className="text-[10px] font-normal text-muted-foreground px-1.5 py-0.5 bg-muted rounded-md border border-border/50">
                {modelName}
              </span>
            )}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {totalTokensSession > 0
              ? `${totalTokensSession.toLocaleString()} tokens (~$${totalCostSession.toFixed(
                  4
                )})`
              : 'Ready to help'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Chat Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && !isGenerating && (
            <div className="text-center text-xs text-muted-foreground mt-10">
              Ask me anything about this question! I can provide hints, check
              your working, or explain concepts.
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex flex-col max-w-[90%] space-y-1',
                msg.role === 'user'
                  ? 'ml-auto items-end'
                  : 'mr-auto items-start'
              )}
            >
              <div
                className={cn(
                  'px-3 py-2 rounded-lg text-xs leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-none'
                    : 'bg-muted text-foreground rounded-bl-none border border-border/50'
                )}
              >
                <div
                  className={cn(
                    msg.role === 'user'
                      ? 'text-primary-foreground [&_.math-inline]:text-primary-foreground [&_.math-display]:text-primary-foreground'
                      : ''
                  )}
                >
                  <MarkdownMath content={msg.content} />
                </div>
              </div>
            </div>
          ))}

          {/* Streaming chunk */}
          {isGenerating && (
            <div className="flex flex-col max-w-[90%] mr-auto items-start space-y-1">
              <div className="px-3 py-2 rounded-lg text-xs leading-relaxed bg-muted text-foreground rounded-bl-none border border-border/50">
                {streamedContent ? (
                  <MarkdownMath content={streamedContent} />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-3 border-t border-border bg-background">
        <div className="relative flex items-end">
          <Textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for a hint..."
            className="min-h-[40px] max-h-[120px] pr-10 resize-none py-2 text-xs"
            disabled={isGenerating}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 bottom-1 h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={() => void handleSend()}
            disabled={!inputValue.trim() || isGenerating}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
