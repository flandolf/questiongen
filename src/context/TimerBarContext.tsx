import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export interface TimerBarData {
  questionNumber: number;
  totalQuestions: number;
  currentQuestionTimeUsed: number;
  currentQuestionTimeLimit: number;
  currentQuestionRemaining: number;
  formattedQuestionTime: string;
  parTimeSeconds: number;
  bankedSeconds: number;
  formattedBank: string;
  bankStatus: 'ahead' | 'behind' | 'on-pace';
  formattedSessionTime: string;
  isQuestionExpired: boolean;
  mode: 'exam' | 'practice';
}

interface TimerBarContextValue {
  timerBarData: TimerBarData | null;
  setTimerBarData: (data: TimerBarData | null) => void;
}

const TimerBarContext = createContext<TimerBarContextValue>({
  timerBarData: null,
  setTimerBarData: () => {},
});

export function TimerBarProvider({ children }: { children: ReactNode }) {
  const [timerBarData, setTimerBarDataState] = useState<TimerBarData | null>(
    null
  );

  const setTimerBarData = useCallback((data: TimerBarData | null) => {
    setTimerBarDataState(data);
  }, []);

  return (
    <TimerBarContext.Provider value={{ timerBarData, setTimerBarData }}>
      {children}
    </TimerBarContext.Provider>
  );
}

export function useTimerBar() {
  return useContext(TimerBarContext);
}
