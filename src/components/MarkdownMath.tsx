import { memo, useEffect, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  normalizeMathDelimiters,
  restoreMathPlaceholders,
  shieldMathForMarkdown,
} from '../lib/app-utils';

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
  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);
  const shielded = useMemo(
    () => shieldMathForMarkdown(normalized),
    [normalized],
  );

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    // Restore protected math placeholders after markdown rendering.
    const restorePlaceholders = () => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        const textNode = current as Text;
        const originalText = textNode.textContent;
        if (originalText) {
          const restoredText = restoreMathPlaceholders(
            originalText,
            shielded.placeholders,
          );
          if (restoredText !== originalText) {
            textNode.textContent = restoredText;
          }
        }
        current = walker.nextNode();
      }
    };

    const typeset = () => {
      restorePlaceholders();

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
  }, [shielded]);

  return (
    <div
      ref={containerRef}
      className='prose prose-base dark:prose-invert max-w-none font-normal'
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} key={shielded.markdown}>
        {shielded.markdown}
      </ReactMarkdown>
    </div>
  );
});
