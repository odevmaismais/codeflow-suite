import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function LogTimeManuallyDialog({ open, onOpenChange, onSuccess }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadTasks();
      setDefaultTimes();
    }
  }, [open]);

  function setDefaultTimes() {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const formatTime = (d: Date) => {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    };

    setStartTime(formatTime(oneHourAgo));
    setEndTime(formatTime(now));
  }

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

  function calculateDuration(): { hours: number; minutes: number; seconds: number } {
    if (!startTime || !endTime) return { hours: 0, minutes: 0, seconds: 0 };

    const startDate = new Date(`${date}T${startTime}`);
    const endDate = new Date(`${date}T${endTime}`);
    const diffSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

    const hours = Math.floor(diffSeconds / 3600);
    const minutes = Math.floor((diffSeconds % 3600) / 60);

    return { hours, minutes, seconds: diffSeconds };
  }

  async function handleSubmit() {
    try {
      setLoading(true);

      // Validation
      if (!selectedTaskId && !selectedProjectId) {
        toast({
          title: 'Validation Error',
          description: 'Please select a task or project',
          variant: 'destructive',
        });
        return;
      }

      if (!startTime || !endTime) {
        toast({
          title: 'Validation Error',
          description: 'Please enter start and end times',
          variant: 'destructive',
        });
        return;
      }

      const startDate = new Date(`${date}T${startTime}`);
      const endDate = new Date(`${date}T${endTime}`);

      if (endDate <= startDate) {
        toast({
          title: 'Validation Error',
          description: 'End time must be after start time',
          variant: 'destructive',
        });
        return;
      }

      if (startDate > new Date() || endDate > new Date()) {
        toast({
          title: 'Validation Error',
          description: 'Cannot log time in the future',
          variant: 'destructive',
        });
        return;
      }

      const { seconds } = calculateDuration();

      if (seconds < 60) {
        toast({
          title: 'Validation Error',
          description: 'Duration must be at least 1 minute',
          variant: 'destructive',
        });
        return;
      }

      if (seconds > 4 * 3600 && !description.trim()) {
        toast({
          title: 'Validation Error',
          description: 'Description is required for sessions longer than 4 hours',
          variant: 'destructive',
        });
        return;
      }

      if (seconds > 12 * 3600) {
        if (!confirm('This is a very long session (over 12 hours). Are you sure?')) {
          return;
        }
      }

      const org = await getCurrentOrganization();
      if (!org) throw new Error('No organization found');

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      // Check for overlaps
      const { data: hasOverlap, error: overlapError } = await supabase.rpc('check_time_entry_overlap', {
        p_user_id: user.user.id,
        p_start_time: startDate.toISOString(),
        p_end_time: endDate.toISOString(),
      });

      if (overlapError) throw overlapError;
      if (hasOverlap) {
        toast({
          title: 'Overlap Detected',
          description: 'Time entry overlaps with existing entry',
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

      // Insert time entry
      const { error: insertError } = await supabase.from('time_entries').insert({
        organization_id: org.id,
        user_id: user.user.id,
        task_id: selectedTaskId || null,
        project_id: selectedProjectId || null,
        timer_type: 'manual',
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        duration_seconds: seconds,
        description: description.trim(),
        is_billable: isBillable,
      });

      if (insertError) throw insertError;

      // Update task actual hours
      if (selectedTaskId) {
        await supabase.rpc('update_task_actual_hours', { p_task_id: selectedTaskId });
      }

      const { hours, minutes } = calculateDuration();
      const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      toast({
        title: 'Time Logged',
        description: `Time logged: ${durationStr}`,
      });

      onSuccess();
    } catch (error: any) {
      console.error('Error logging time:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to log time',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  const duration = calculateDuration();
  const durationStr = duration.hours > 0 
    ? `${duration.hours}h ${duration.minutes}m` 
    : `${duration.minutes}m`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Time Manually</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Task (required)</Label>
            <Select
              value={selectedTaskId}
              onValueChange={(value) => {
                setSelectedTaskId(value);
                const task = tasks.find(t => t.id === value);
                if (task?.project_id) {
                  setSelectedProjectId(task.project_id);
                }
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
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Duration</Label>
            <div className="text-2xl font-bold">{durationStr}</div>
          </div>

          <div className="space-y-2">
            <Label>Description {duration.seconds > 4 * 3600 && '(required for 4+ hours)'}</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={3}
              maxLength={500}
            />
            <div className="text-xs text-muted-foreground text-right">
              {description.length} / 500
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="manual-billable"
              checked={isBillable}
              onCheckedChange={(checked) => setIsBillable(checked as boolean)}
            />
            <Label htmlFor="manual-billable">Is billable</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Logging...' : 'Log Time'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
