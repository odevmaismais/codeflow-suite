import { useState, useEffect } from 'react';
import { useTimer } from '@/contexts/TimerContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Play, Pause, Square, Minimize2, Maximize2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentOrganization } from '@/lib/auth';

interface Task {
  id: string;
  code: string;
  title: string;
  project_name: string | null;
  project_id: string | null;
}

export function QuickTimerWidget() {
  const { timerState, startTimer, pauseTimer, resumeTimer, stopTimer, updateTimerTask, updateTimerDescription, updateTimerBillable, resetTimer } = useTimer();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveData, setSaveData] = useState<any>(null);
  const { toast } = useToast();

  const isQuickTimer = timerState.timerType === 'quick_timer';

  useEffect(() => {
    loadTasks();
  }, []);

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

  function formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function handleStart() {
    if (timerState.isRunning && timerState.timerType !== 'quick_timer') {
      toast({
        title: 'Timer Already Running',
        description: 'Another timer is already running. Stop it first.',
        variant: 'destructive',
      });
      return;
    }
    startTimer('quick_timer');
    setIsExpanded(true);
  }

  function handlePause() {
    pauseTimer();
  }

  function handleResume() {
    resumeTimer();
  }

  function handleStop() {
    try {
      const { startTime, endTime, duration } = stopTimer();
      
      // Always show save modal on stop - task selection happens here if not set
      setSaveData({
        taskId: timerState.taskId,
        projectId: timerState.projectId,
        startTime,
        endTime,
        duration,
        description: timerState.description,
        isBillable: timerState.isBillable,
      });
      setShowSaveModal(true);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }

  async function handleSaveTimeEntry() {
    try {
      const org = await getCurrentOrganization();
      if (!org) throw new Error('No organization found');

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Check for overlaps
      const { data: hasOverlap, error: overlapError } = await supabase.rpc('check_time_entry_overlap', {
        p_user_id: user.user.id,
        p_start_time: saveData.startTime.toISOString(),
        p_end_time: saveData.endTime.toISOString(),
      });

      if (overlapError) throw overlapError;
      if (hasOverlap) {
        toast({
          title: 'Overlap Detected',
          description: 'Time entry overlaps with existing entry.',
          variant: 'destructive',
        });
        return;
      }

      // Check limit
      const { data: canCreate, error: limitError } = await supabase.rpc('check_time_entry_limit', {
        p_org_id: org.id,
        p_user_id: user.user.id,
      });

      if (limitError) throw limitError;
      if (!canCreate) {
        toast({
          title: 'Limit Reached',
          description: 'Free plan allows max 100 time entries per month. Upgrade to Pro for unlimited.',
          variant: 'destructive',
        });
        return;
      }

      const { error: insertError } = await supabase.from('time_entries').insert({
        organization_id: org.id,
        user_id: user.user.id,
        task_id: saveData.taskId,
        project_id: saveData.projectId,
        timer_type: 'quick_timer',
        start_time: saveData.startTime.toISOString(),
        end_time: saveData.endTime.toISOString(),
        duration_seconds: saveData.duration,
        description: saveData.description,
        is_billable: saveData.isBillable,
      });

      if (insertError) throw insertError;

      // Update task actual hours
      if (saveData.taskId) {
        await supabase.rpc('update_task_actual_hours', { p_task_id: saveData.taskId });
      }

      const hours = Math.floor(saveData.duration / 3600);
      const minutes = Math.floor((saveData.duration % 3600) / 60);
      const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      toast({
        title: 'Time Logged',
        description: `Time logged: ${durationStr}`,
      });

      setShowSaveModal(false);
      resetTimer();
      setIsExpanded(false);
    } catch (error: any) {
      console.error('Error saving time entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save time entry',
        variant: 'destructive',
      });
    }
  }

  function handleDiscardTimeEntry() {
    setShowSaveModal(false);
    resetTimer();
    setIsExpanded(false);
    toast({
      title: 'Time Entry Discarded',
    });
  }

  if (!isVisible || !isQuickTimer) return null;

  return (
    <>
      <div
        className="fixed bottom-5 right-5 z-[1000] bg-background border border-border rounded-lg shadow-lg"
        style={{ width: isExpanded ? '320px' : '200px' }}
      >
        {!isExpanded ? (
          // Minimized State
          <div
            className="p-4 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => setIsExpanded(true)}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold">{formatTime(timerState.elapsedSeconds)}</div>
                {timerState.taskCode && (
                  <div className="text-xs text-muted-foreground">{timerState.taskCode}</div>
                )}
              </div>
              <Maximize2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        ) : (
          // Expanded State
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Quick Timer</h3>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setIsExpanded(false)}>
                  <Minimize2 className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setIsVisible(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold">{formatTime(timerState.elapsedSeconds)}</div>
            </div>

            <div className="space-y-2">
              <Label>Task (optional - can be set on stop)</Label>
              <Select
                value={timerState.taskId || ''}
                onValueChange={(value) => {
                  const task = tasks.find(t => t.id === value);
                  updateTimerTask(value, task?.code || null, task?.project_id || null);
                }}
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
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="billable"
                checked={timerState.isBillable}
                onCheckedChange={(checked) => updateTimerBillable(checked as boolean)}
              />
              <Label htmlFor="billable">Is billable</Label>
            </div>

            <div className="flex gap-2">
              {!timerState.isRunning && (
                <Button onClick={handleStart} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
              )}
              {timerState.isRunning && !timerState.isPaused && (
                <Button onClick={handlePause} variant="secondary" className="flex-1">
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
              {timerState.isRunning && timerState.isPaused && (
                <Button onClick={handleResume} className="flex-1">
                  <Play className="h-4 w-4 mr-2" />
                  Resume
                </Button>
              )}
              {timerState.isRunning && (
                <Button onClick={handleStop} variant="destructive" className="flex-1">
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save Time Entry Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Time Entry</DialogTitle>
          </DialogHeader>
          {saveData && (
            <div className="space-y-4">
              <div>
                <Label>Duration</Label>
                <div className="text-2xl font-bold">
                  {Math.floor(saveData.duration / 3600)}h {Math.floor((saveData.duration % 3600) / 60)}m
                </div>
              </div>
              <div>
                <Label>Task (required)</Label>
                <Select
                  value={saveData.taskId || ''}
                  onValueChange={(value) => {
                    const task = tasks.find(t => t.id === value);
                    setSaveData({ 
                      ...saveData, 
                      taskId: value,
                      projectId: task?.project_id || null
                    });
                  }}
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
              <div>
                <Label>Description</Label>
                <Textarea
                  value={saveData.description}
                  onChange={(e) => setSaveData({ ...saveData, description: e.target.value })}
                  rows={3}
                  placeholder="What did you work on?"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="save-billable"
                  checked={saveData.isBillable}
                  onCheckedChange={(checked) => setSaveData({ ...saveData, isBillable: checked })}
                />
                <Label htmlFor="save-billable">Is billable</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleDiscardTimeEntry}>
              Discard
            </Button>
            <Button onClick={handleSaveTimeEntry} disabled={!saveData?.taskId}>
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
