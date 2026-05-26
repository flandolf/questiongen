import { getCurrentWindow } from '@tauri-apps/api/window';
import { Maximize, Minus, X } from 'lucide-react';
import { useRef } from 'react';

export default function Titlebar() {
  const barRef = useRef<HTMLDivElement>(null);

  const appWindow = getCurrentWindow();

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (e.detail === 2) {
      void getCurrentWindow().toggleMaximize();
    } else {
      void getCurrentWindow().startDragging();
    }
  };

  return (
    <div
      ref={barRef}
      className='w-full h-9 flex items-center px-4 bg-background border-b border-border/60 select-none'
      style={{ userSelect: 'none', position: 'relative', zIndex: 50 }}
      onMouseDown={handleMouseDown}
    >
      <span className='flex-1 font-semibold text-sm text-foreground/80 tracking-tight'>
        questiongen
      </span>
      <div className='flex -mr-1'>
        <button
          aria-label='Minimize'
          className='w-9 h-9 flex items-center justify-center hover:bg-muted/60 text-muted-foreground/60 hover:text-foreground pointer-events-auto transition-colors'
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void appWindow.minimize()}
        >
          <Minus className='w-3.5 h-3.5' />
        </button>
        <button
          aria-label='Maximize'
          className='w-9 h-9 flex items-center justify-center hover:bg-muted/60 text-muted-foreground/60 hover:text-foreground pointer-events-auto transition-colors'
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void appWindow.toggleMaximize()}
        >
          <Maximize className='w-3.5 h-3.5' />
        </button>
        <button
          aria-label='Close'
          className='w-9 h-9 flex items-center justify-center hover:bg-red-500/80 hover:text-white text-muted-foreground/60 pointer-events-auto transition-colors'
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => void appWindow.close()}
        >
          <X className='w-3.5 h-3.5' />
        </button>
      </div>
    </div>
  );
}
