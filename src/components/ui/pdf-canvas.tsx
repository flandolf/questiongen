import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface PdfCanvasProps {
  src: string;
  className?: string;
}

export function PdfCanvas({ src, className }: PdfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  useEffect(() => {
    if (!src) return;
    setError(null);

    let abortController: AbortController;

    const loadPdf = async () => {
      abortController = new AbortController();
      try {
        const opts: Record<string, unknown> = { cMapPacked: true };

        if (src.startsWith('data:')) {
          const base64 = src.split(',', 2)[1] ?? src;
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          opts.data = bytes;
        } else {
          opts.url = src;
        }

        const loadingTask = pdfjsLib.getDocument(opts);

        const pdf = await loadingTask.promise;
        setPageCount(pdf.numPages);

        for (let i = 1; i <= pdf.numPages; i++) {
          if (abortController.signal.aborted) return;
          const page = await pdf.getPage(i);
          const scale = 1.5;
          const viewport = page.getViewport({ scale });

          const canvas = canvasRefs.current.get(i);
          if (!canvas) continue;

          const context = canvas.getContext('2d');
          if (!context) continue;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport,
            canvas,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
      }
    };

    void loadPdf();

    return () => {
      abortController.abort();
    };
  }, [src]);

  if (error) {
    return (
      <div className='flex items-center justify-center h-full text-sm text-destructive'>
        {error}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ overflow: 'auto' }}>
      <div className='flex flex-col items-center gap-2 p-2'>
        {pageCount === 0 ? (
          <div className='flex items-center justify-center h-32'>
            <div className='w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin' />
          </div>
        ) : (
          Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
            <canvas
              key={pageNum}
              ref={(el) => {
                if (el) canvasRefs.current.set(pageNum, el);
              }}
              className='max-w-full shadow-md'
            />
          ))
        )}
      </div>
    </div>
  );
}
