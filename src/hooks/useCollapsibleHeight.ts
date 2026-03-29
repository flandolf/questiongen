import { useCallback, useEffect, useRef, useState } from 'react';

export function useCollapsibleHeight(defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<string | number>(
    defaultOpen ? 'auto' : 0
  );
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeight((h) => {
        if (h === 'auto' || h === 0) return h;
        return el.scrollHeight;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggle = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    if (open) {
      setHeight(el.scrollHeight);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setHeight(0));
      });
    } else {
      setHeight(el.scrollHeight);
    }
    setOpen((v) => !v);
  }, [open]);

  const handleTransitionEnd = useCallback(() => {
    if (open) setHeight('auto');
  }, [open]);

  return { open, height, innerRef, toggle, handleTransitionEnd };
}
