import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { format, endOfWeek } from "date-fns";

interface TimeEntry {
  id: string;
  start_time: string;
  duration_seconds: number;
  description: string;
  is_billable: boolean;
  task_id: string | null;
  task_code?: string;
  task_title?: string;
}

interface CreateTimesheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  weekStart: Date;
  onSuccess: () => void;
}

export function CreateTimesheetDialog({ open, onOpenChange, weekStart, onSuccess }: CreateTimesheetDialogProps) {
  const [availableEntries, setAvailableEntries] = useState<TimeEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadAvailableEntries();
    }
  }, [open, weekStart]);

  const loadAvailableEntries = async () => {
    try {
      const org = await getCurrentOrganization();
      if (!org) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const weekStartStr = format(weekStart, "yyyy-MM-dd");

      const { data, error } = await supabase.rpc("get_orphaned_time_entries", {
        p_user_id: user.id,
        p_week_start: weekStartStr
      });

      if (error) throw error;

      // Fetch task details for entries
      const enrichedEntries = await Promise.all(
        (data || []).map(async (entry: any) => {
          if (entry.task_id) {
            const { data: taskData } = await supabase
              .from("tasks")
              .select("code, title")
              .eq("id", entry.task_id)
              .single();

            return {
              ...entry,
              task_code: taskData?.code,
              task_title: taskData?.title
            };
          }
          return entry;
        })
      );

      setAvailableEntries(enrichedEntries);
      setSelectedEntries(new Set(enrichedEntries.map((e: any) => e.id)));
    } catch (error: any) {
      console.error("Error loading available entries:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleToggleEntry = (entryId: string) => {
    const newSelected = new Set(selectedEntries);
    if (newSelected.has(entryId)) {
      newSelected.delete(entryId);
    } else {
      newSelected.add(entryId);
    }
    setSelectedEntries(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedEntries.size === availableEntries.length) {
      setSelectedEntries(new Set());
    } else {
      setSelectedEntries(new Set(availableEntries.map(e => e.id)));
    }
  };

  const handleCreate = async () => {
    if (selectedEntries.size === 0) {
      toast({
        title: "Error",
        description: "Please select at least one time entry",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const org = await getCurrentOrganization();
      if (!org) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const weekStartStr = format(weekStart, "yyyy-MM-dd");
      const weekEndStr = format(endOfWeek(weekStart, { weekStartsOn: 1 }), "yyyy-MM-dd");

      // Create timesheet
      const { data: timesheet, error: timesheetError } = await supabase
        .from("timesheets")
        .insert({
          organization_id: org.id,
          user_id: user.id,
          week_start_date: weekStartStr,
          week_end_date: weekEndStr,
          status: "draft"
        })
        .select()
        .single();

      if (timesheetError) throw timesheetError;

      // Add selected entries to timesheet
      const timesheetEntries = Array.from(selectedEntries).map(entryId => ({
        timesheet_id: timesheet.id,
        time_entry_id: entryId
      }));

      const { error: entriesError } = await supabase
        .from("timesheet_entries")
        .insert(timesheetEntries);

      if (entriesError) throw entriesError;

      // Calculate and update hours
      const { data: hoursData } = await supabase.rpc("calculate_timesheet_hours", {
        p_timesheet_id: timesheet.id
      });

      if (hoursData && hoursData.length > 0) {
        await supabase
          .from("timesheets")
          .update({
            total_hours: hoursData[0].total_hours,
            billable_hours: hoursData[0].billable_hours
          })
          .eq("id", timesheet.id);
      }

      toast({
        title: "Success",
        description: `Timesheet created with ${selectedEntries.size} entries`
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error creating timesheet:", error);
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

  const totalSelectedSeconds = availableEntries
    .filter(e => selectedEntries.has(e.id))
    .reduce((sum, e) => sum + e.duration_seconds, 0);

  const billableSelectedSeconds = availableEntries
    .filter(e => selectedEntries.has(e.id) && e.is_billable)
    .reduce((sum, e) => sum + e.duration_seconds, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Create Timesheet for {format(weekStart, "MMM d")} - {format(endOfWeek(weekStart, { weekStartsOn: 1 }), "MMM d, yyyy")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {availableEntries.length} {availableEntries.length === 1 ? "entry" : "entries"} available
            </p>
            <Button variant="outline" size="sm" onClick={handleSelectAll}>
              {selectedEntries.size === availableEntries.length ? "Deselect All" : "Select All"}
            </Button>
          </div>

          {availableEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No time entries available for this week</p>
          ) : (
            <div className="border rounded-lg">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left w-12"></th>
                    <th className="p-3 text-left">Date</th>
                    <th className="p-3 text-left">Task</th>
                    <th className="p-3 text-left">Duration</th>
                    <th className="p-3 text-left">Description</th>
                    <th className="p-3 text-left">Billable</th>
                  </tr>
                </thead>
                <tbody>
                  {availableEntries.map((entry) => (
                    <tr key={entry.id} className="border-t">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedEntries.has(entry.id)}
                          onCheckedChange={() => handleToggleEntry(entry.id)}
                        />
                      </td>
                      <td className="p-3">{format(new Date(entry.start_time), "MMM d")}</td>
                      <td className="p-3">
                        {entry.task_code ? (
                          <span className="text-sm">
                            {entry.task_code} - {entry.task_title}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">No task</span>
                        )}
                      </td>
                      <td className="p-3">{formatDuration(entry.duration_seconds)}</td>
                      <td className="p-3 max-w-xs truncate">{entry.description || "-"}</td>
                      <td className="p-3">{entry.is_billable ? "✓" : "✗"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Total Hours</p>
              <p className="text-lg font-bold">{formatDuration(totalSelectedSeconds)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Billable Hours</p>
              <p className="text-lg font-bold">{formatDuration(billableSelectedSeconds)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Entries</p>
              <p className="text-lg font-bold">{selectedEntries.size} selected</p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={loading || selectedEntries.size === 0}>
              {loading ? "Creating..." : "Create Timesheet"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
