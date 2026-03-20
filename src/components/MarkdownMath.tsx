import { MathJax } from "better-react-mathjax";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import { normalizeMathDelimiters } from "../lib/app-utils";

type MarkdownMathProps = {
  content: string;
};

export const MarkdownMath = memo(function MarkdownMath({ content }: MarkdownMathProps) {
  const sanitized = useMemo(() => normalizeMathDelimiters(content), [content]);
  return (
    <MathJax dynamic>
      <div className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown>{sanitized}</ReactMarkdown>
      </div>
    </MathJax>
  );
});
