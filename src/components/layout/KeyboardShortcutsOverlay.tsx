import { AnimatePresence,motion } from 'framer-motion';
import { Command, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const SHORTCUTS = [
  { key: '← / P', label: 'Previous Question', category: 'Navigation' },
  { key: '→ / N', label: 'Next Question', category: 'Navigation' },
  { key: 'Ctrl + Enter', label: 'Submit Answer', category: 'Action' },
  { key: 'Esc', label: 'Exit Session / Reset', category: 'Action' },
  { key: '?', label: 'Show / Hide Shortcuts', category: 'General' },
];

export function KeyboardShortcutsOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '?' && (e.target as HTMLElement).tagName !== 'INPUT' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[9999]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-card border border-border shadow-2xl rounded-2xl z-[10000] p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Command className="w-5 h-5 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {['Navigation', 'Action', 'General'].map((category) => (
                <div key={category}>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 px-1">
                    {category}
                  </h3>
                  <div className="space-y-2">
                    {SHORTCUTS.filter((s) => s.category === category).map((shortcut) => (
                      <div
                        key={shortcut.key}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">{shortcut.label}</span>
                        <div className="flex gap-1">
                          {shortcut.key.split(' + ').map((part, i) => (
                            <div key={i} className="flex items-center gap-1">
                              {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                              <kbd className="min-w-[24px] h-6 px-1.5 flex items-center justify-center bg-muted border border-border rounded text-[10px] font-mono font-bold shadow-sm">
                                {part}
                              </kbd>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 pt-6 border-t border-border flex justify-center">
              <p className="text-xs text-muted-foreground">
                Press <kbd className="px-1 py-0.5 bg-muted rounded border text-[10px]">?</kbd> anytime to toggle this menu
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
