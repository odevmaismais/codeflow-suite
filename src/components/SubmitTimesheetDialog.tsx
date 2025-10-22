import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";

interface Timesheet {
  id: string;
  status: string;
  total_hours: number;
  billable_hours: number;
}

interface TimeEntry {
  id: string;
  description: string;
  duration_seconds: number;
}

interface SubmitTimesheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timesheet: Timesheet;
  timeEntries: TimeEntry[];
  onSuccess: () => void;
}

export function SubmitTimesheetDialog({
  open,
  onOpenChange,
  timesheet,
  timeEntries,
  onSuccess
}: SubmitTimesheetDialogProps) {
  const [loading, setLoading] = useState(false);

  const warnings = [];

  // Check for entries without description
  const noDescriptionCount = timeEntries.filter(e => !e.description || e.description.trim() === "").length;
  if (noDescriptionCount > 0) {
    warnings.push(`⚠️ ${noDescriptionCount} ${noDescriptionCount === 1 ? "entry has" : "entries have"} no description`);
  }

  // Check for entries exceeding 12 hours
  const longEntries = timeEntries.filter(e => e.duration_seconds > 12 * 3600).length;
  if (longEntries > 0) {
    warnings.push(`⚠️ ${longEntries} ${longEntries === 1 ? "entry exceeds" : "entries exceed"} 12 hours`);
  }

  const handleSubmit = async () => {
    if (timeEntries.length === 0) {
      toast({
        title: "Error",
        description: "Cannot submit empty timesheet. Add time entries first.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("timesheets")
        .update({
          status: "submitted",
          submitted_at: new Date().toISOString(),
          rejection_reason: null
        })
        .eq("id", timesheet.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Timesheet submitted for approval"
      });

      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error("Error submitting timesheet:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Submit Timesheet for Approval</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm">
              Once submitted, you cannot edit or delete time entries until reviewed.
            </p>
            <p className="text-sm mt-2">
              Your Tech Lead will be notified to review this timesheet.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Summary</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Hours</p>
                <p className="font-medium">{formatHours(timesheet.total_hours)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Billable Hours</p>
                <p className="font-medium">{formatHours(timesheet.billable_hours)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Entries</p>
                <p className="font-medium">{timeEntries.length}</p>
              </div>
            </div>
          </div>

          {warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                Warnings
              </h4>
              <ul className="space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="text-sm text-yellow-600">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Submitting..." : "Submit for Approval"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
