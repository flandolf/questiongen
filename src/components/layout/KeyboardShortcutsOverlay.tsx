import { AnimatePresence, motion } from 'framer-motion';
import { Command, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useGenerationStatus } from '@/AppContext';

const SHORTCUTS = [
  { key: '← / P', label: 'Previous Question', category: 'Navigation' },
  { key: '→ / N', label: 'Next Question', category: 'Navigation' },
  { key: 'Ctrl + Enter', label: 'Submit Answer', category: 'Action' },
  { key: 'Esc', label: 'Exit Session / Reset', category: 'Action' },
  { key: '?', label: 'Show / Hide Shortcuts', category: 'General' },
];

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toUpperCase();
  const editableSelectors = [
    'INPUT',
    'TEXTAREA',
    'SELECT',
    'BUTTON',
    '[contenteditable="true"]',
  ];
  return (
    editableSelectors.includes(tagName) ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

export function KeyboardShortcutsOverlay() {
  const {
    isKeyboardShortcutsOpen: isOpen,
    setIsKeyboardShortcutsOpen: setIsOpen,
  } = useGenerationStatus();

  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && !isEditableTarget(e.target)) {
        setIsOpen(!isOpen);
      }

      if (!isOpen) return;

      if (e.key === 'Escape') {
        setIsOpen(false);
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[
          focusableElements.length - 1
        ] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, setIsOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className='fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999]'
          />
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role='dialog'
            aria-modal='true'
            aria-labelledby='keyboard-shortcuts-title'
            className='fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl z-[10000] p-6 outline-none'
          >
            <div className='flex items-center justify-between mb-6'>
              <div className='flex items-center gap-2'>
                <div className='p-2 bg-primary/10 rounded-lg'>
                  <Command className='w-5 h-5 text-primary' />
                </div>
                <h2
                  id='keyboard-shortcuts-title'
                  className='text-lg font-semibold'
                >
                  Keyboard Shortcuts
                </h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                aria-label='Close keyboard shortcuts'
                className='p-1 hover:bg-muted rounded-full transition-colors'
              >
                <X className='w-5 h-5' />
              </button>
            </div>

            <div className='space-y-6'>
              {['Navigation', 'Action', 'General'].map((category) => (
                <div key={category}>
                  <h3 className='text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1'>
                    {category}
                  </h3>
                  <div className='space-y-2'>
                    {SHORTCUTS.filter((s) => s.category === category).map(
                      (shortcut) => (
                        <div
                          key={shortcut.key}
                          className='flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors'
                        >
                          <span className='text-sm font-medium'>
                            {shortcut.label}
                          </span>
                          <div className='flex gap-1'>
                            {shortcut.key.split(' + ').map((part, i) => (
                              <div key={i} className='flex items-center gap-1'>
                                {i > 0 && (
                                  <span className='text-xs text-muted-foreground'>
                                    +
                                  </span>
                                )}
                                <kbd className='min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-muted border border-border rounded text-[10px] font-mono font-bold shadow-sm'>
                                  {part}
                                </kbd>
                              </div>
                            ))}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className='mt-8 pt-6 border-t border-border flex justify-center'>
              <p className='text-xs text-muted-foreground'>
                Press{' '}
                <kbd className='px-1 py-0.5 bg-muted rounded border text-[10px]'>
                  ?
                </kbd>{' '}
                anytime to toggle this menu
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
