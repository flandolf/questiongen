import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type ZoomLevel = 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2 | 2.5 | 3;

export const ZOOM_LEVELS: ZoomLevel[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];

export interface PdfCanvasProps {
  src: string;
  className?: string;
  zoom?: ZoomLevel;
  scrollToPage?: number | null;
  onPageChange?: (page: number) => void;
}

export function PdfCanvas({
  src,
  className,
  zoom = 1.5,
  scrollToPage,
  onPageChange,
}: PdfCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set());
  const currentPageRef = useRef(1);
  const pageCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const pdfDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  const renderPage = useCallback(
    async (pageNum: number, scale: number) => {
      if (renderedPages.has(pageNum)) return;

      const pdf = pdfDocRef.current;
      if (!pdf) return;

      try {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = pageCanvasRefs.current.get(pageNum);
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
          canvasContext: context,
          viewport,
          canvas,
        } as any).promise;

        setRenderedPages((prev) => new Set(prev).add(pageNum));
      } catch {
        // Silent fail on render error
      }
    },
    [renderedPages],
  );

  useEffect(() => {
    if (!src) return;
    setError(null);
    setRenderedPages(new Set());
    pdfDocRef.current = null;

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
        pdfDocRef.current = await loadingTask.promise;
        setPageCount(pdfDocRef.current.numPages);
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

  useEffect(() => {
    if (!containerRef.current || pageCount === 0) return;

    if (!pdfDocRef.current) return;

    const container = containerRef.current;

    renderPage(1, zoom);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page') || '0', 10);
            if (pageNum) {
              renderPage(pageNum, zoom);
              currentPageRef.current = pageNum;
              onPageChange?.(pageNum);
            }
          }
        });
      },
      { root: container, rootMargin: '300px', threshold: 0 },
    );

    pageContainerRefs.current.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [pageCount, renderPage, zoom, onPageChange]);

  useEffect(() => {
    if (scrollToPage === null || scrollToPage === undefined || !containerRef.current) return;
    const pageEl = pageContainerRefs.current.get(scrollToPage);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollToPage]);

  if (error) {
    return (
      <div className='flex items-center justify-center h-full text-sm text-destructive'>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ overflow: 'auto' }}
    >
      <div
        className='flex flex-col items-center gap-2 p-2'
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
      >
        {pageCount === 0 ? (
          <div className='flex items-center justify-center h-32'>
            <div className='w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin' />
          </div>
        ) : (
          Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNum) => (
            <div
              key={pageNum}
              ref={(el) => {
                if (el) pageContainerRefs.current.set(pageNum, el);
              }}
              data-page={pageNum}
              className='min-h-[100px] flex items-center justify-center'
            >
              <canvas
                ref={(el) => {
                  if (el) pageCanvasRefs.current.set(pageNum, el);
                }}
                className='max-w-full shadow-md'
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}