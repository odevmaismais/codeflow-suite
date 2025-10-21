import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface TimerState {
  isRunning: boolean;
  isPaused: boolean;
  timerType: 'quick_timer' | 'pomodoro_focus' | 'pomodoro_break' | null;
  taskId: string | null;
  taskCode: string | null;
  projectId: string | null;
  startTimestamp: number | null;
  elapsedSeconds: number;
  durationSeconds: number | null; // null for quick timer, set for pomodoro
  description: string;
  isBillable: boolean;
}

interface TimerContextType {
  timerState: TimerState;
  startTimer: (type: TimerState['timerType'], duration?: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  stopTimer: () => { startTime: Date; endTime: Date; duration: number };
  updateTimerTask: (taskId: string | null, taskCode: string | null, projectId: string | null) => void;
  updateTimerDescription: (description: string) => void;
  updateTimerBillable: (isBillable: boolean) => void;
  resetTimer: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

const STORAGE_KEY = 'devflow_timer_state';

const initialState: TimerState = {
  isRunning: false,
  isPaused: false,
  timerType: null,
  taskId: null,
  taskCode: null,
  projectId: null,
  startTimestamp: null,
  elapsedSeconds: 0,
  durationSeconds: null,
  description: '',
  isBillable: true,
};

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timerState, setTimerState] = useState<TimerState>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Calculate elapsed time if timer was running
        if (parsed.isRunning && !parsed.isPaused && parsed.startTimestamp) {
          const now = Date.now();
          const elapsed = Math.floor((now - parsed.startTimestamp) / 1000);
          parsed.elapsedSeconds = elapsed;
        }
        return parsed;
      } catch {
        return initialState;
      }
    }
    return initialState;
  });

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (timerState.isRunning || timerState.elapsedSeconds > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(timerState));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [timerState]);

  // Tick timer every second
  useEffect(() => {
    if (!timerState.isRunning || timerState.isPaused) return;

    const interval = setInterval(() => {
      setTimerState(prev => ({
        ...prev,
        elapsedSeconds: prev.elapsedSeconds + 1,
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [timerState.isRunning, timerState.isPaused]);

  const startTimer = useCallback((type: TimerState['timerType'], duration?: number) => {
    setTimerState({
      ...initialState,
      isRunning: true,
      timerType: type,
      startTimestamp: Date.now(),
      durationSeconds: duration || null,
      isBillable: true,
    });
  }, []);

  const pauseTimer = useCallback(() => {
    setTimerState(prev => ({ ...prev, isPaused: true }));
  }, []);

  const resumeTimer = useCallback(() => {
    setTimerState(prev => ({ ...prev, isPaused: false }));
  }, []);

  const stopTimer = useCallback(() => {
    if (!timerState.startTimestamp) {
      throw new Error('Timer not started');
    }

    const startTime = new Date(timerState.startTimestamp);
    const endTime = new Date();
    const duration = timerState.elapsedSeconds;

    return { startTime, endTime, duration };
  }, [timerState]);

  const updateTimerTask = useCallback((taskId: string | null, taskCode: string | null, projectId: string | null) => {
    setTimerState(prev => ({ ...prev, taskId, taskCode, projectId }));
  }, []);

  const updateTimerDescription = useCallback((description: string) => {
    setTimerState(prev => ({ ...prev, description }));
  }, []);

  const updateTimerBillable = useCallback((isBillable: boolean) => {
    setTimerState(prev => ({ ...prev, isBillable }));
  }, []);

  const resetTimer = useCallback(() => {
    setTimerState(initialState);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <TimerContext.Provider
      value={{
        timerState,
        startTimer,
        pauseTimer,
        resumeTimer,
        stopTimer,
        updateTimerTask,
        updateTimerDescription,
        updateTimerBillable,
        resetTimer,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within TimerProvider');
  }
  return context;
}
