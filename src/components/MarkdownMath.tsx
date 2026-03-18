import { MathJax } from "better-react-mathjax";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const MarkdownMath = memo(function MarkdownMath({ content }: { content: string }) {
  // We add an extra layer of escaping specifically for the Markdown parser.
  // This ensures that after ReactMarkdown "cleans" the string,
  // a single backslash still exists in the DOM for MathJax to see.
  const protectedContent = content.replace(/\\/g, "\\\\");

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none math-markdown">
      <MathJax dynamic>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {protectedContent}
        </ReactMarkdown>
      </MathJax>
    </div>
  );
});