import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Edit, Trash2, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getCurrentOrganization } from '@/lib/auth';
import { LogTimeManuallyDialog } from '@/components/LogTimeManuallyDialog';
import { PageLayout } from '@/components/PageLayout';
import { EmptyState } from '@/components/EmptyState';

interface TimeEntry {
  id: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  timer_type: string;
  description: string;
  is_billable: boolean;
  is_approved: boolean;
  task_code: string | null;
  task_title: string | null;
  project_name: string | null;
}

export default function TimeEntries() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ totalTime: 0, billableTime: 0, approvedTime: 0, count: 0 });
  const [showLogDialog, setShowLogDialog] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTimeEntries();
  }, []);

  async function loadTimeEntries() {
    try {
      setLoading(true);
      const org = await getCurrentOrganization();
      if (!org) return;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;

      const { data, error } = await supabase
        .from('time_entries')
        .select(`
          id,
          start_time,
          end_time,
          duration_seconds,
          timer_type,
          description,
          is_billable,
          is_approved,
          tasks (code, title),
          projects (name)
        `)
        .eq('user_id', user.user.id)
        .is('deleted_at', null)
        .order('start_time', { ascending: false })
        .limit(50);

      if (error) throw error;

      const formatted = data.map((e: any) => ({
        id: e.id,
        start_time: e.start_time,
        end_time: e.end_time,
        duration_seconds: e.duration_seconds,
        timer_type: e.timer_type,
        description: e.description,
        is_billable: e.is_billable,
        is_approved: e.is_approved,
        task_code: e.tasks?.code || null,
        task_title: e.tasks?.title || null,
        project_name: e.projects?.name || null,
      }));

      setEntries(formatted);

      // Calculate summary
      const totalTime = formatted.reduce((sum, e) => sum + e.duration_seconds, 0);
      const billableTime = formatted.filter(e => e.is_billable).reduce((sum, e) => sum + e.duration_seconds, 0);
      const approvedTime = formatted.filter(e => e.is_approved).reduce((sum, e) => sum + e.duration_seconds, 0);
      setSummary({
        totalTime,
        billableTime,
        approvedTime,
        count: formatted.length,
      });
    } catch (error: any) {
      console.error('Error loading time entries:', error);
      toast({
        title: 'Error',
        description: 'Failed to load time entries',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this time entry?')) return;

    try {
      const { error } = await supabase
        .from('time_entries')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Time Entry Deleted',
      });

      loadTimeEntries();
    } catch (error: any) {
      console.error('Error deleting time entry:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete time entry',
        variant: 'destructive',
      });
    }
  }

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  function formatTime(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getTimerTypeColor(type: string): string {
    switch (type) {
      case 'pomodoro_focus':
        return 'bg-green-500';
      case 'pomodoro_break':
        return 'bg-blue-500';
      case 'quick_timer':
        return 'bg-orange-500';
      case 'manual':
        return 'bg-gray-500';
      default:
        return 'bg-gray-500';
    }
  }

  function getTimerTypeLabel(type: string): string {
    switch (type) {
      case 'pomodoro_focus':
        return 'Pomodoro Focus';
      case 'pomodoro_break':
        return 'Pomodoro Break';
      case 'quick_timer':
        return 'Quick Timer';
      case 'manual':
        return 'Manual';
      default:
        return type;
    }
  }

  return (
    <PageLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Time Entries</h1>
        <Button onClick={() => setShowLogDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Time Manually
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Time</div>
          <div className="text-2xl font-bold">{formatDuration(summary.totalTime)}</div>
          <div className="text-xs text-muted-foreground">This week</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Billable Time</div>
          <div className="text-2xl font-bold">{formatDuration(summary.billableTime)}</div>
          <div className="text-xs text-muted-foreground">
            {summary.totalTime > 0 ? Math.round((summary.billableTime / summary.totalTime) * 100) : 0}% billable
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Approved Time</div>
          <div className="text-2xl font-bold">{formatDuration(summary.approvedTime)}</div>
          <div className="text-xs text-muted-foreground">
            {summary.totalTime > 0 ? Math.round((summary.approvedTime / summary.totalTime) * 100) : 0}% approved
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Entries Count</div>
          <div className="text-2xl font-bold">{summary.count}</div>
          <div className="text-xs text-muted-foreground">entries this week</div>
        </Card>
      </div>

      {/* Time Entries Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Task</TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Billable</TableHead>
              <TableHead>Approved</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-12">
                  <EmptyState
                    icon={Plus}
                    title="No time entries yet"
                    description="Start a timer or log time manually to begin tracking."
                    actionLabel="Log Time"
                    onAction={() => setShowLogDialog(true)}
                  />
                </TableCell>
              </TableRow>
            ) : (
              entries.map(entry => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.start_time)}</TableCell>
                  <TableCell>{formatTime(entry.start_time)}</TableCell>
                  <TableCell>{formatTime(entry.end_time)}</TableCell>
                  <TableCell className="font-medium">{formatDuration(entry.duration_seconds)}</TableCell>
                  <TableCell>
                    {entry.task_code ? (
                      <div>
                        <div className="font-medium">{entry.task_code}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {entry.task_title}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">No task</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.project_name || <span className="text-muted-foreground">No project</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={getTimerTypeColor(entry.timer_type)}>
                      {getTimerTypeLabel(entry.timer_type)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate" title={entry.description}>
                      {entry.description || <span className="text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.is_billable ? (
                      <span className="text-green-600">✓</span>
                    ) : (
                      <span className="text-gray-400">✗</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.is_approved ? (
                      <Badge variant="default">Approved</Badge>
                    ) : (
                      <Badge variant="secondary">Pending</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {!entry.is_approved && (
                      <div className="flex justify-end gap-2">
                        <Button size="icon" variant="ghost" disabled>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <LogTimeManuallyDialog
        open={showLogDialog}
        onOpenChange={setShowLogDialog}
        onSuccess={() => {
          setShowLogDialog(false);
          loadTimeEntries();
        }}
      />
    </PageLayout>
  );
}
