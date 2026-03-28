import { getCurrentWindow } from '@tauri-apps/api/window';
import { Maximize, Minus, X } from 'lucide-react';

import { useRef } from 'react';
import { useTimerBar } from '@/context/TimerBarContext';
import { QuestionTimerBar } from '@/components/generator/QuestionTimerBar';

export default function Titlebar() {
  const barRef = useRef<HTMLDivElement>(null);
  const { timerBarData } = useTimerBar();

  // Manual drag and double-click maximize per Tauri v2 docs
  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    if (e.detail === 2) {
      await getCurrentWindow().toggleMaximize();
    } else {
      await getCurrentWindow().startDragging();
    }
  };

  return (
    <div className="flex flex-col">
      <div
        ref={barRef}
        className="w-full h-10 flex items-center px-3 bg-background border-b border-border select-none overflow-hidden"
        style={{ userSelect: 'none', position: 'relative', zIndex: 50 }}
        onMouseDown={handleMouseDown}
      >
        <span className="flex-1 font-semibold text-sm text-primary" >questiongen</span>
        <div className="flex gap-1">
          <button
            aria-label="Minimize"
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xs"
            onClick={() => getCurrentWindow().minimize()}
          >
              <Minus className="w-3 h-3" />
          </button>
          <button
            aria-label="Maximize"
            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xs"
            onClick={() => getCurrentWindow().toggleMaximize()}
          >
          <Maximize className="w-3 h-3" />
          </button>
          <button
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center hover:bg-red-500/80 hover:text-white rounded-xs"
            onClick={() => getCurrentWindow().close()}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      {timerBarData && (
        <div className="px-2 pb-1 bg-background border-b border-border/40" style={{ zIndex: 50 }}>
          <QuestionTimerBar {...timerBarData} />
        </div>
      )}
    </div>
  );
}
