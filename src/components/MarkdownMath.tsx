import { Component, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { normalizeMathDelimiters } from "../lib/app-utils";

type MarkdownMathProps = {
  content: string;
  onFallbackChange?: (isFallback: boolean) => void;
};

export function MarkdownMath({ content, onFallbackChange }: MarkdownMathProps) {
  const normalizedContent = normalizeMathDelimiters(content);

  return (
    <MarkdownMathErrorBoundary
      fallback={<MarkdownFallback content={normalizedContent} />}
      onFallbackChange={onFallbackChange}
    >
      <div className="prose prose-sm dark:prose-invert max-w-none math-markdown">
        <ReactMarkdown
          remarkPlugins={[remarkMath]}
          rehypePlugins={[[rehypeKatex, { throwOnError: true, strict: "error" }] as never]}
        >
          {normalizedContent}
        </ReactMarkdown>
      </div>
    </MarkdownMathErrorBoundary>
  );
}

function MarkdownFallback({ content }: { content: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-amber-400/60 bg-amber-100/60 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-500/60 dark:bg-amber-900/40 dark:text-amber-200">
        Some math formatting could not be rendered. Showing plain markdown fallback.
      </div>
      <div className="prose prose-sm dark:prose-invert max-w-none math-markdown">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

type MarkdownMathErrorBoundaryProps = {
  children: ReactNode;
  fallback: ReactNode;
  onFallbackChange?: (isFallback: boolean) => void;
};

type MarkdownMathErrorBoundaryState = {
  hasError: boolean;
};

class MarkdownMathErrorBoundary extends Component<
  MarkdownMathErrorBoundaryProps,
  MarkdownMathErrorBoundaryState
> {
  constructor(props: MarkdownMathErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): MarkdownMathErrorBoundaryState {
    return { hasError: true };
  }

  componentDidUpdate(
    prevProps: MarkdownMathErrorBoundaryProps,
    prevState: MarkdownMathErrorBoundaryState,
  ) {
    if (prevState.hasError !== this.state.hasError) {
      this.props.onFallbackChange?.(this.state.hasError);
    }

    if (prevProps.onFallbackChange !== this.props.onFallbackChange && this.state.hasError) {
      this.props.onFallbackChange?.(true);
    }

    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch() {
    this.props.onFallbackChange?.(true);
  }

  componentWillUnmount() {
    this.props.onFallbackChange?.(false);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
