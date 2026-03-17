import { MathJax } from "better-react-mathjax";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMathDelimiters } from "../lib/app-utils";

type MarkdownMathProps = {
  content: string;
  onFallbackChange?: (isFallback: boolean) => void;
};

export const MarkdownMath = memo(function MarkdownMath({ content }: MarkdownMathProps) {
  const sanitized = useMemo(() => normalizeMathDelimiters(content), [content]);
  return (
    <MathJax dynamic>
      <div className="prose prose-sm dark:prose-invert max-w-none math-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitized}</ReactMarkdown>
      </div>
    </MathJax>
  );
});
