import { memo, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { normalizeMathDelimiters } from '../lib/app-utils';

type MathJaxRuntime = {
  typesetPromise?: (elements?: Element[]) => Promise<void>;
  typesetClear?: (elements?: Element[]) => void;
};

function getMathJaxRuntime(): MathJaxRuntime | undefined {
  return window.MathJax as MathJaxRuntime | undefined;
}

type MarkdownMathProps = {
  content: string;
};

export const MarkdownMath = memo(function MarkdownMath({
  content,
}: MarkdownMathProps) {
  const sanitized = useMemo(() => normalizeMathDelimiters(content), [content]);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const typeset = () => {
      const runtime = getMathJaxRuntime();
      if (typeof runtime?.typesetPromise !== 'function') {
        return;
      }

      if (typeof runtime.typesetClear === 'function') {
        runtime.typesetClear([container]);
      }

      void runtime.typesetPromise([container]);
    };

    if (typeof getMathJaxRuntime()?.typesetPromise === 'function') {
      typeset();
      return;
    }

    window.addEventListener('mathjax:ready', typeset);

    return () => {
      window.removeEventListener('mathjax:ready', typeset);
    };
  }, [sanitized]);

  return (
    <div
      ref={containerRef}
      className="prose prose-base dark:prose-invert max-w-none font-normal"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} key={sanitized}>{sanitized}</ReactMarkdown>
    </div>
  );
});
