import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { AlertCircle } from "lucide-react";

interface TimesheetForReview {
  id: string;
  user_id: string;
  user_email: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  total_hours: number;
  billable_hours: number;
}

interface TimeEntry {
  id: string;
  start_time: string;
  duration_seconds: number;
  description: string;
  is_billable: boolean;
  task_code?: string;
  task_title?: string;
}

interface ReviewTimesheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timesheet: TimesheetForReview;
  onSuccess: () => void;
}

export function ReviewTimesheetDialog({ open, onOpenChange, timesheet, onSuccess }: ReviewTimesheetDialogProps) {
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadTimeEntries();
    }
  }, [open, timesheet.id]);

  const loadTimeEntries = async () => {
    try {
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select(`
          time_entry_id,
          time_entries (
            id,
            start_time,
            duration_seconds,
            description,
            is_billable,
            task_id,
            tasks (code, title)
          )
        `)
        .eq("timesheet_id", timesheet.id);

      if (error) throw error;

      const entries = data?.map((item: any) => ({
        id: item.time_entries.id,
        start_time: item.time_entries.start_time,
        duration_seconds: item.time_entries.duration_seconds,
        description: item.time_entries.description,
        is_billable: item.time_entries.is_billable,
        task_code: item.time_entries.tasks?.code,
        task_title: item.time_entries.tasks?.title
      })) || [];

      setTimeEntries(entries);
    } catch (error: any) {
      console.error("Error loading time entries:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (user.id === timesheet.user_id) {
        toast({
          title: "Error",
          description: "Cannot approve your own timesheet",
          variant: "destructive"
        });
        return;
      }

      // Update timesheet status
      const { error: timesheetError } = await supabase
        .from("timesheets")
        .update({
          status: "approved",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString()
        })
        .eq("id", timesheet.id);

      if (timesheetError) throw timesheetError;

      // Mark all time entries as approved
      const entryIds = timeEntries.map(e => e.id);
      const { error: entriesError } = await supabase
        .from("time_entries")
        .update({ is_approved: true })
        .in("id", entryIds);

      if (entriesError) throw entriesError;

      toast({
        title: "Success",
        description: `Timesheet approved for ${timesheet.user_email}`
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error approving timesheet:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({
        title: "Error",
        description: "Rejection reason is required",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("timesheets")
        .update({
          status: "rejected",
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectionReason.trim()
        })
        .eq("id", timesheet.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Timesheet rejected for ${timesheet.user_email}`
      });

      onSuccess();
    } catch (error: any) {
      console.error("Error rejecting timesheet:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const warnings = [];
  const noDescriptionCount = timeEntries.filter(e => !e.description || e.description.trim() === "").length;
  if (noDescriptionCount > 0) {
    warnings.push(`${noDescriptionCount} ${noDescriptionCount === 1 ? "entry has" : "entries have"} no description`);
  }

  const longEntries = timeEntries.filter(e => e.duration_seconds > 12 * 3600).length;
  if (longEntries > 0) {
    warnings.push(`${longEntries} ${longEntries === 1 ? "entry exceeds" : "entries exceed"} 12 hours`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Review Timesheet - {timesheet.user_email} - {format(new Date(timesheet.week_start_date), "MMM d")}-{format(new Date(timesheet.week_end_date), "d, yyyy")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">User</p>
              <p className="font-medium">{timesheet.user_email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Hours</p>
              <p className="font-medium">{timesheet.total_hours.toFixed(2)}h</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billable Hours</p>
              <p className="font-medium">{timesheet.billable_hours.toFixed(2)}h</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Entries</p>
              <p className="font-medium">{timeEntries.length}</p>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <h4 className="font-medium flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                Validation Warnings
              </h4>
              <ul className="space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="text-sm text-yellow-600">⚠️ {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Time Entries Table */}
          <div className="border rounded-lg">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Task</th>
                  <th className="p-3 text-left">Duration</th>
                  <th className="p-3 text-left">Description</th>
                  <th className="p-3 text-left">Billable</th>
                </tr>
              </thead>
              <tbody>
                {timeEntries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="p-3">{format(new Date(entry.start_time), "MMM d")}</td>
                    <td className="p-3">{format(new Date(entry.start_time), "h:mm a")}</td>
                    <td className="p-3">
                      {entry.task_code ? (
                        <span className="text-sm">{entry.task_code} - {entry.task_title}</span>
                      ) : (
                        <span className="text-muted-foreground">No task</span>
                      )}
                    </td>
                    <td className="p-3">{formatDuration(entry.duration_seconds)}</td>
                    <td className="p-3 max-w-xs">
                      {entry.description ? (
                        <span className="text-sm">{entry.description}</span>
                      ) : (
                        <span className="text-muted-foreground italic">No description</span>
                      )}
                    </td>
                    <td className="p-3">{entry.is_billable ? "✓" : "✗"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          {timesheet.status === "submitted" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Feedback / Rejection Reason (required for rejection)</label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Provide feedback for the developer..."
                  maxLength={500}
                  rows={3}
                  className="mt-2"
                />
                <p className="text-xs text-muted-foreground mt-1">{rejectionReason.length} / 500</p>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={loading}
                >
                  {loading ? "Rejecting..." : "Reject"}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {loading ? "Approving..." : "Approve"}
                </Button>
              </div>
            </div>
          )}

          {timesheet.status !== "submitted" && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
