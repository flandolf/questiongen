import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { normalizeMathDelimiters } from "../lib/app-utils";

export function MarkdownMath({ content }: { content: string }) {
  const normalizedContent = normalizeMathDelimiters(content);

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none math-markdown">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
