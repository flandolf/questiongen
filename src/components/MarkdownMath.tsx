import { MathJax } from "better-react-mathjax";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const MarkdownMath = memo(function MarkdownMath({ content }: { content: string }) {
  return (
      <MathJax dynamic>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </MathJax>
  );
});