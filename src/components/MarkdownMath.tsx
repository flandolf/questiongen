import Color from 'colorjs.io';
import mermaid from 'mermaid';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  normalizeMathDelimiters,
  restoreMathPlaceholders,
  shieldMathForMarkdown,
} from '../lib/app-utils';
import { useTheme } from './theme-provider';

type MarkdownMathProps = {
  content: string;
  isStreaming?: boolean;
};

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

const components: Components = {
  code(props) {
    const { className, children, node: _node, ...rest } = props;
    const match = /language-mermaid/.exec(className || '');
    if (match) {
      let chart = '';
      if (typeof children === 'string') {
        chart = children;
      } else if (Array.isArray(children)) {
        chart = children.map((c) => (typeof c === 'string' ? c : '')).join('');
      }
      return <Mermaid chart={chart.replace(/\n$/, '')} />;
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};

export const MarkdownMath = memo(function MarkdownMath({
  content,
  isStreaming = false,
}: MarkdownMathProps) {
  const normalized = useMemo(() => normalizeMathDelimiters(content), [content]);
  const shielded = useMemo(
    () => shieldMathForMarkdown(normalized),
    [normalized],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);

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
      // 1. Restore protected math placeholders after markdown rendering.
      restorePlaceholders();

      const runtime = window.MathJax;
      if (!runtime) return;

      // 2. Typesetting logic
      const performTypeset = () => {
        if (typeof runtime.typesetPromise !== 'function') return;

        // Trigger typesetting and catch errors to prevent promise rejection
        // from bubbling up to React's error boundary.
        runtime.typesetPromise([container]).catch((err) => {
          console.error('MathJax typesetPromise error:', err);
        });
      };

      // 3. Ensure MathJax is fully initialized before typesetting.
      // MathJax 4 uses startup.promise to indicate readiness.
      if (runtime.startup?.promise) {
        runtime.startup.promise.then(performTypeset).catch((err) => {
          console.error('MathJax startup promise error:', err);
          // Try to perform typeset anyway as a fallback
          performTypeset();
        });
      } else {
        // Fallback for when startup.promise is missing (should not happen in v4)
        performTypeset();
      }
    };

    const scheduleTypeset = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      if (isStreaming) {
        // When streaming, debounce typesetting to reduce flashing.
        // 160ms is roughly 10 frames, giving a balance between responsiveness and stability.
        timeoutRef.current = setTimeout(() => {
          rafRef.current = requestAnimationFrame(typeset);
        }, 160);
      } else {
        rafRef.current = requestAnimationFrame(typeset);
      }
    };

    // If MathJax is already available, schedule typeset.
    if (typeof window.MathJax?.typesetPromise === 'function') {
      scheduleTypeset();
    } else {
      // Otherwise, wait for the loader to signal readiness.
      const handleReady = () => scheduleTypeset();
      window.addEventListener('mathjax:ready', handleReady);
      return () => {
        window.removeEventListener('mathjax:ready', handleReady);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [shielded, isStreaming]);

  return (
    <div
      ref={containerRef}
      className='prose prose-base dark:prose-invert max-w-none font-normal'
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        key={shielded.markdown}
      >
        {shielded.markdown}
      </ReactMarkdown>
    </div>
  );
});