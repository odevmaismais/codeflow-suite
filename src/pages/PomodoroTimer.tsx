import { useState, useEffect } from 'react';
import { useTimer } from '@/contexts/TimerContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Play, Pause, Square, SkipForward } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentOrganization } from '@/lib/auth';
import { Link } from 'react-router-dom';

const FOCUS_DURATION = 25 * 60; // 25 minutes
const BREAK_DURATION = 5 * 60; // 5 minutes

interface Task {
  id: string;
  code: string;
  title: string;
  project_name: string | null;
  project_id: string | null;
}

export default function PomodoroTimer() {
  const { timerState, startTimer, pauseTimer, resumeTimer, stopTimer, updateTimerTask, updateTimerDescription, updateTimerBillable, resetTimer } = useTimer();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessionCounts, setSessionCounts] = useState({ focus: 0, break: 0 });
  const { toast } = useToast();
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);

  const isPomodoro = timerState.timerType === 'pomodoro_focus' || timerState.timerType === 'pomodoro_break';
  const isFocus = timerState.timerType === 'pomodoro_focus';
  const isBreak = timerState.timerType === 'pomodoro_break';

  useEffect(() => {
    loadTasks();
    loadTodaySessions();
    setAudioContext(new (window.AudioContext || (window as any).webkitAudioContext)());
  }, []);

  // Check if timer is complete
  useEffect(() => {
    if (!isPomodoro || !timerState.isRunning || timerState.isPaused) return;
    if (!timerState.durationSeconds) return;

    if (timerState.elapsedSeconds >= timerState.durationSeconds) {
      handleTimerComplete();
    }
  }, [timerState.elapsedSeconds, isPomodoro]);

  async function loadTasks() {
    try {
      const org = await getCurrentOrganization();
      if (!org) return;

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          code,
          title,
          project_id,
          projects (name)
        `)
        .eq('organization_id', org.id)
        .not('status', 'in', '(archived,done)')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setTasks(
        data.map((t: any) => ({
          id: t.id,
          code: t.code,
          title: t.title,
          project_name: t.projects?.name || null,
          project_id: t.project_id,
        }))
      );
    } catch (error: any) {
      console.error('Error loading tasks:', error);
    }
  }

  async function loadTodaySessions() {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('time_entries')
        .select('timer_type')
        .eq('user_id', user.user.id)
        .gte('start_time', today.toISOString())
        .in('timer_type', ['pomodoro_focus', 'pomodoro_break']);

      if (error) throw error;

      const focus = data.filter(e => e.timer_type === 'pomodoro_focus').length;
      const breakCount = data.filter(e => e.timer_type === 'pomodoro_break').length;
      setSessionCounts({ focus, break: breakCount });
    } catch (error: any) {
      console.error('Error loading sessions:', error);
    }
  }

  function playNotificationSound() {
    if (!audioContext) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  }

  async function handleTimerComplete() {
    playNotificationSound();
    
    const { startTime, endTime, duration } = stopTimer();
    
    try {
      const org = await getCurrentOrganization();
      if (!org) throw new Error('No organization found');

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { error: insertError } = await supabase.from('time_entries').insert({
        organization_id: org.id,
        user_id: user.user.id,
        task_id: timerState.taskId,
        project_id: timerState.projectId,
        timer_type: timerState.timerType,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: duration,
        description: timerState.description,
        is_billable: timerState.isBillable,
      });

      if (insertError) throw insertError;

      if (timerState.taskId) {
        await supabase.rpc('update_task_actual_hours', { p_task_id: timerState.taskId });
      }

      if (isFocus) {
        toast({
          title: 'Focus Complete! 🎉',
          description: 'Time for a break.',
        });
        setSessionCounts(prev => ({ ...prev, focus: prev.focus + 1 }));
      } else {
        toast({
          title: 'Break Complete! ☕',
          description: 'Ready for focus?',
        });
        setSessionCounts(prev => ({ ...prev, break: prev.break + 1 }));
      }

      resetTimer();
      loadTodaySessions();
    } catch (error: any) {
      console.error('Error saving time entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save time entry',
        variant: 'destructive',
      });
    }
  }

  async function handleSkip() {
    const { startTime, endTime, duration } = stopTimer();
    
    try {
      const org = await getCurrentOrganization();
      if (!org) throw new Error('No organization found');

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      const { error: insertError } = await supabase.from('time_entries').insert({
        organization_id: org.id,
        user_id: user.user.id,
        task_id: timerState.taskId,
        project_id: timerState.projectId,
        timer_type: timerState.timerType,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: duration,
        description: timerState.description,
        is_billable: timerState.isBillable,
      });

      if (insertError) throw insertError;

      if (timerState.taskId) {
        await supabase.rpc('update_task_actual_hours', { p_task_id: timerState.taskId });
      }

      const mins = Math.floor(duration / 60);
      toast({
        title: 'Session Skipped',
        description: `Logged ${mins} minutes`,
      });

      resetTimer();
      loadTodaySessions();
    } catch (error: any) {
      console.error('Error saving time entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save time entry',
        variant: 'destructive',
      });
    }
  }

  function handleStartFocus() {
    if (timerState.isRunning && timerState.timerType !== 'pomodoro_focus') {
      toast({
        title: 'Timer Already Running',
        description: 'Another timer is already running. Stop it first.',
        variant: 'destructive',
      });
      return;
    }
    startTimer('pomodoro_focus', FOCUS_DURATION);
  }

  function handleStartBreak() {
    if (timerState.isRunning && timerState.timerType !== 'pomodoro_break') {
      toast({
        title: 'Timer Already Running',
        description: 'Another timer is already running. Stop it first.',
        variant: 'destructive',
      });
      return;
    }
    startTimer('pomodoro_break', BREAK_DURATION);
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getRemainingTime(): number {
    if (!timerState.durationSeconds) return 0;
    return Math.max(0, timerState.durationSeconds - timerState.elapsedSeconds);
  }

  function getProgress(): number {
    if (!timerState.durationSeconds) return 0;
    return (timerState.elapsedSeconds / timerState.durationSeconds) * 100;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Pomodoro Timer</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold">Pomodoro Timer</h1>
        <p className="text-muted-foreground">Focus for 25 minutes, break for 5 minutes</p>
      </div>

      <div className="flex justify-end">
        <Card className="p-4">
          <div className="text-sm font-medium mb-2">Today's Sessions</div>
          <div className="text-lg">
            🔥 Focus: {sessionCounts.focus} | ☕ Break: {sessionCounts.break}
          </div>
          {sessionCounts.focus > 0 && sessionCounts.focus % 4 === 0 && (
            <div className="mt-2 text-sm text-primary">
              🎉 Great work! Take a long break (15 min)
            </div>
          )}
        </Card>
      </div>

      <div className="flex flex-col items-center justify-center space-y-8 py-12">
        {/* Timer Display */}
        <div className="relative">
          <svg width="300" height="300" className="transform -rotate-90">
            <circle
              cx="150"
              cy="150"
              r="140"
              fill="none"
              stroke="hsl(var(--muted))"
              strokeWidth="8"
            />
            <circle
              cx="150"
              cy="150"
              r="140"
              fill="none"
              stroke={isFocus ? 'hsl(var(--primary))' : 'hsl(var(--chart-2))'}
              strokeWidth="8"
              strokeDasharray={2 * Math.PI * 140}
              strokeDashoffset={2 * Math.PI * 140 * (1 - getProgress() / 100)}
              strokeLinecap="round"
              className="transition-all duration-1000"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-5xl font-bold">
              {formatTime(timerState.isRunning && isPomodoro ? getRemainingTime() : (isFocus ? FOCUS_DURATION : BREAK_DURATION))}
            </div>
          </div>
        </div>

        {/* Task Selection */}
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2">
            <Label>Task (optional)</Label>
            <Select
              value={timerState.taskId || ''}
              onValueChange={(value) => {
                const task = tasks.find(t => t.id === value);
                updateTimerTask(value, task?.code || null, task?.project_id || null);
              }}
              disabled={timerState.isRunning}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a task…" />
              </SelectTrigger>
              <SelectContent>
                {tasks.map(task => (
                  <SelectItem key={task.id} value={task.id}>
                    {task.code} - {task.title} {task.project_name && `(${task.project_name})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={timerState.description}
              onChange={(e) => updateTimerDescription(e.target.value)}
              placeholder="What are you working on?"
              rows={2}
              maxLength={500}
              disabled={timerState.isRunning}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="pomodoro-billable"
              checked={timerState.isBillable}
              onCheckedChange={(checked) => updateTimerBillable(checked as boolean)}
              disabled={timerState.isRunning}
            />
            <Label htmlFor="pomodoro-billable">Is billable</Label>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-3">
          {!timerState.isRunning && (
            <>
              <Button size="lg" onClick={handleStartFocus}>
                <Play className="h-5 w-5 mr-2" />
                Start Focus (25 min)
              </Button>
              <Button size="lg" onClick={handleStartBreak} variant="secondary">
                <Play className="h-5 w-5 mr-2" />
                Start Break (5 min)
              </Button>
            </>
          )}
          {timerState.isRunning && isPomodoro && !timerState.isPaused && (
            <Button size="lg" onClick={pauseTimer} variant="secondary">
              <Pause className="h-5 w-5 mr-2" />
              Pause
            </Button>
          )}
          {timerState.isRunning && isPomodoro && timerState.isPaused && (
            <Button size="lg" onClick={resumeTimer}>
              <Play className="h-5 w-5 mr-2" />
              Resume
            </Button>
          )}
          {timerState.isRunning && isPomodoro && (
            <>
              <Button size="lg" onClick={handleSkip} variant="outline">
                <SkipForward className="h-5 w-5 mr-2" />
                Skip
              </Button>
              <Button size="lg" onClick={handleSkip} variant="destructive">
                <Square className="h-5 w-5 mr-2" />
                Stop
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
