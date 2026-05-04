import Color from 'colorjs.io';
import mermaid from 'mermaid';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  normalizeMathDelimiters,
  shieldMathForMarkdown,
} from '../lib/app-utils';
import { useTheme } from './theme-provider';

type MarkdownMathProps = {
  content: string;
  isStreaming?: boolean;
  className?: string;
};

function normalizeMarkdownLineBreaks(content: string): string {
  return (
    content
      .replace(/\\r\\n/g, '\n')
      // Decode escaped newlines, but keep LaTeX command prefixes such as \nabla.
      .replace(/\\n(?![A-Za-z])/g, '\n')
      // Ensure markdown reference-style [text] (a) renders on their own line.
      .replace(/\n?(\[[\s\S]*?\]\s*\([a-z]\))\n?/gi, '$1\n')
  );
}

const MathNode = memo(
  ({
    latex,
    isStreaming,
    isDisplay = false,
  }: {
    latex: string;
    isStreaming?: boolean;
    isDisplay?: boolean;
  }) => {
    const containerRef = useRef<HTMLSpanElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // Reset to raw LaTeX so MathJax has something to find and typeset.
      // We wrap it in a span to keep the DOM predictable.
      container.innerHTML = `<span>${latex}</span>`;

      const performTypeset = () => {
        const runtime = window.MathJax;
        if (!runtime || typeof runtime.typesetPromise !== 'function') return;

        runtime
          .typesetPromise([container])
          .then(() => {
            // Once typeset, remove the streaming-only styling
            if (container) {
              container.classList.remove('opacity-70');
              // Dispatch event to notify parent (e.g. TutorPanel) to check for width updates
              container.dispatchEvent(
                new CustomEvent('math-typeset-complete', {
                  bubbles: true,
                  detail: { isDisplay },
                }),
              );
            }
          })
          .catch((err) => {
            console.error('MathJax typeset error:', err);
          });
      };

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (isStreaming) {
        container.classList.add('opacity-70');
        // During streaming, debounce typesetting to avoid excessive layout shifts
        timeoutRef.current = setTimeout(performTypeset, 150);
      } else {
        container.classList.remove('opacity-70');
        performTypeset();
      }

      return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      };
    }, [latex, isStreaming, isDisplay]);

    return (
      <span
        ref={containerRef}
        className={`math-node min-w-[1ch] ${isDisplay ? 'block w-full my-3' : 'inline-block'}`}
      />
    );
  },
);

MathNode.displayName = 'MathNode';

const Mermaid = ({ chart }: { chart: string }) => {
  const { theme } = useTheme();
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const isDark =
    theme === 'dark' ||
    (theme === 'system' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const rootStyle = window.getComputedStyle(document.documentElement);
    // eslint-disable-next-line complexity
    const resolveColor = (varName: string): string => {
      const bodyStyle = document.body
        ? window.getComputedStyle(document.body)
        : null;

      // Try multiple ways to find the variable
      let computedValue = rootStyle.getPropertyValue(varName).trim();
      if (!computedValue && bodyStyle) {
        computedValue = bodyStyle.getPropertyValue(varName).trim();
      }

      // Tailwind 4 often uses --color-* for theme variables
      if (!computedValue && !varName.startsWith('--color-')) {
        const altName = `--color-${varName.slice(2)}`;
        computedValue = rootStyle.getPropertyValue(altName).trim();
        if (!computedValue && bodyStyle) {
          computedValue = bodyStyle.getPropertyValue(altName).trim();
        }
      }

      if (!computedValue) {
        // Fallback colors to prevent black-on-black or invisible diagrams
        const isDarkMode =
          theme === 'dark' ||
          (theme === 'system' &&
            window.matchMedia('(prefers-color-scheme: dark)').matches);

        const fallbacks: Record<string, string> = isDarkMode
          ? {
              '--background': '#0a0a0a',
              '--foreground': '#ffffff',
              '--primary': '#3b82f6',
              '--muted-foreground': '#a1a1aa',
              '--card': '#1a1a1a',
              '--chart-2': '#e11d48',
              '--chart-3': '#f59e0b',
            }
          : {
              '--background': '#ffffff',
              '--foreground': '#0a0a0a',
              '--primary': '#2563eb',
              '--muted-foreground': '#71717a',
              '--card': '#ffffff',
              '--chart-2': '#e11d48',
              '--chart-3': '#f59e0b',
            };

        return fallbacks[varName] || '#888888';
      }

      try {
        // Handle raw components (e.g. "0 0% 100%") if not already wrapped
        let colorString = computedValue;
        if (
          !colorString.includes('(') &&
          !colorString.startsWith('#') &&
          /[0-9.%\s]+/.test(colorString)
        ) {
          colorString = colorString.includes('%')
            ? `hsl(${colorString})`
            : `oklch(${colorString})`;
        }

        return new Color(colorString).to('srgb').toString({ format: 'hex' });
      } catch (error) {
        try {
          return new Color(computedValue)
            .to('srgb')
            .toString({ format: 'hex' });
        } catch (innerError) {
          console.error(
            `Error converting ${varName} (${computedValue}) ${(error as Error).message}:`,
            innerError,
          );
          return '#888888';
        }
      }
    };

    const primary = resolveColor('--primary');
    const foreground = resolveColor('--foreground');
    const background = resolveColor('--background');
    const mutedForeground = resolveColor('--muted-foreground');

    mermaid.initialize({
      startOnLoad: false,
      theme: 'base', // important: use base when supplying themeVariables
      securityLevel: 'loose',
      fontFamily:
        rootStyle.getPropertyValue('--font-sans').trim() ||
        'Inter, system-ui, sans-serif',
      themeVariables: {
        darkMode: isDark,
        primaryColor: primary,
        primaryTextColor: foreground,
        primaryBorderColor: primary,
        lineColor: mutedForeground,
        background,
        mainBkg: background,
        secondBkg: background,
        tertiaryColor: background,
        textColor: foreground,
        nodeTextColor: foreground,
      },
      flowchart: {
        htmlLabels: true,
        useMaxWidth: true,
        curve: 'basis',
      },
    });
  }, [theme, isDark]);

  useEffect(() => {
    let isMounted = true;
    const id = `mermaid-svg-${Math.random().toString(36).slice(2, 11)}`;

    const renderChart = async () => {
      try {
        setError(null);
        setSvg(''); // optional: prevents stale SVG flash on theme change
        const { svg } = await mermaid.render(id, chart);
        if (isMounted) {
          setSvg(svg);
        }
      } catch (err) {
        console.error('Mermaid render error:', err);
        if (isMounted) {
          setError('Failed to render diagram');
        }
      }
    };

    void renderChart();
    return () => {
      isMounted = false;
    };
  }, [chart, theme, isDark]);

  if (error) {
    return (
      <div className='my-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm font-mono whitespace-pre-wrap'>
        {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className='my-4 h-32 w-full animate-pulse bg-muted/10 rounded-lg flex items-center justify-center border border-border/10'>
        <div className='text-muted-foreground text-xs uppercase tracking-widest'>
          Rendering Diagram...
        </div>
      </div>
    );
  }

  return (
    <div
      className='mermaid-container flex justify-center my-4 overflow-hidden rounded-xl'
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

export const MarkdownMath = memo(function MarkdownMath({
  content,
  isStreaming = false,
  className = '',
}: MarkdownMathProps) {
  const normalizedInput = useMemo(
    () => normalizeMarkdownLineBreaks(content),
    [content],
  );
  const normalized = useMemo(
    () => normalizeMathDelimiters(normalizedInput),
    [normalizedInput],
  );
  const shielded = useMemo(
    () => shieldMathForMarkdown(normalized, isStreaming),
    [normalized, isStreaming],
  );

  const components: Components = useMemo(
    () => ({
      code(props) {
        const { className, children, node: _node, ...rest } = props;

        if (
          typeof children === 'string' &&
          children.startsWith('QGMATH_TOKEN_')
        ) {
          const index = parseInt(children.replace('QGMATH_TOKEN_', ''), 10);
          const placeholder = shielded.placeholders[index];
          if (placeholder) {
            const latex = placeholder[1];
            const trimmed = latex.trim();
            const isDisplay =
              trimmed.startsWith('$$') && trimmed.endsWith('$$');

            return (
              <MathNode
                latex={latex}
                isStreaming={isStreaming}
                isDisplay={isDisplay}
              />
            );
          }
        }

        const match = /language-mermaid/.exec(className || '');
        if (match) {
          let chart = '';
          if (typeof children === 'string') {
            chart = children;
          } else if (Array.isArray(children)) {
            chart = children
              .map((c) => (typeof c === 'string' ? c : ''))
              .join('');
          }
          return <Mermaid chart={chart.replace(/\n$/, '')} />;
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        );
      },
    }),
    [shielded.placeholders, isStreaming],
  );

  return (
    <div
      className={`prose prose-base dark:prose-invert max-w-none font-normal ${className}`}
      style={{
        fontSize: 'inherit',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {shielded.markdown}
      </ReactMarkdown>
    </div>
  );
});
