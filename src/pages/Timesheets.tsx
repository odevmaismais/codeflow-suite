import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { toast } from "@/hooks/use-toast";
import { Calendar, Plus, Trash2, Send } from "lucide-react";
import { CreateTimesheetDialog } from "@/components/CreateTimesheetDialog";
import { SubmitTimesheetDialog } from "@/components/SubmitTimesheetDialog";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";

interface Timesheet {
  id: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  total_hours: number;
  billable_hours: number;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  reviewer_email?: string;
}

interface TimeEntry {
  id: string;
  start_time: string;
  duration_seconds: number;
  description: string;
  is_billable: boolean;
  task_id: string | null;
  task_code?: string;
  task_title?: string;
  project_name?: string;
}

export default function Timesheets() {
  const navigate = useNavigate();
  const [selectedWeek, setSelectedWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [timesheet, setTimesheet] = useState<Timesheet | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [orphanedCount, setOrphanedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);

  const weeks = Array.from({ length: 10 }, (_, i) => {
    const weekOffset = i - 4;
    return addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset);
  });

  useEffect(() => {
    loadTimesheetData();
  }, [selectedWeek]);

  const loadTimesheetData = async () => {
    setLoading(true);
    try {
      const org = await getCurrentOrganization();
      if (!org) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const weekStart = format(selectedWeek, "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), "yyyy-MM-dd");

      // Fetch timesheet for selected week
      const { data: timesheetData, error: timesheetError } = await supabase
        .from("timesheets")
        .select("*")
        .eq("organization_id", org.id)
        .eq("user_id", user.id)
        .eq("week_start_date", weekStart)
        .maybeSingle();

      if (timesheetError) throw timesheetError;

      if (timesheetData) {
        // Fetch reviewer email if exists
        let reviewerEmail = undefined;
        if (timesheetData.reviewed_by) {
          const { data: emailData } = await supabase.rpc("get_user_email", {
            p_user_id: timesheetData.reviewed_by
          });
          reviewerEmail = emailData;
        }

        setTimesheet({
          ...timesheetData,
          reviewer_email: reviewerEmail
        });

        // Fetch time entries for this timesheet
        const { data: entriesData, error: entriesError } = await supabase
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
              tasks (code, title, projects (name))
            )
          `)
          .eq("timesheet_id", timesheetData.id);

        if (entriesError) throw entriesError;

        const entries = entriesData?.map((item: any) => ({
          id: item.time_entries.id,
          start_time: item.time_entries.start_time,
          duration_seconds: item.time_entries.duration_seconds,
          description: item.time_entries.description,
          is_billable: item.time_entries.is_billable,
          task_id: item.time_entries.task_id,
          task_code: item.time_entries.tasks?.code,
          task_title: item.time_entries.tasks?.title,
          project_name: item.time_entries.tasks?.projects?.name
        })) || [];

        setTimeEntries(entries);
      } else {
        setTimesheet(null);
        setTimeEntries([]);

        // Check for orphaned entries
        const { data: orphanedData } = await supabase
          .rpc("get_orphaned_time_entries", {
            p_user_id: user.id,
            p_week_start: weekStart
          });

        setOrphanedCount(orphanedData?.length || 0);
      }
    } catch (error: any) {
      console.error("Error loading timesheet:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTimesheet = async () => {
    if (!timesheet || timesheet.status !== "draft") return;

    try {
      const { error } = await supabase
        .from("timesheets")
        .delete()
        .eq("id", timesheet.id);

      if (error) throw error;

      toast({ title: "Timesheet deleted" });
      loadTimesheetData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleWithdraw = async () => {
    if (!timesheet || timesheet.status !== "submitted") return;

    try {
      const { error } = await supabase
        .from("timesheets")
        .update({
          status: "draft",
          submitted_at: null
        })
        .eq("id", timesheet.id);

      if (error) throw error;

      toast({ title: "Submission withdrawn" });
      loadTimesheetData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      draft: "secondary",
      submitted: "default",
      approved: "default",
      rejected: "destructive"
    };
    return <Badge variant={variants[status]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Timesheets</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Timesheets</h1>
          <p className="text-muted-foreground">Submit weekly timesheets for approval</p>
        </div>
        {!timesheet && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Timesheet
          </Button>
        )}
      </div>

      {/* Week Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {weeks.map((week) => {
          const isSelected = format(week, "yyyy-MM-dd") === format(selectedWeek, "yyyy-MM-dd");
          return (
            <Button
              key={format(week, "yyyy-MM-dd")}
              variant={isSelected ? "default" : "outline"}
              onClick={() => setSelectedWeek(week)}
              className="flex-shrink-0"
            >
              {format(week, "MMM d")} - {format(endOfWeek(week, { weekStartsOn: 1 }), "MMM d")}
            </Button>
          );
        })}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6">Loading...</CardContent>
        </Card>
      ) : timesheet ? (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>
                  Timesheet for {format(selectedWeek, "MMM d")} - {format(endOfWeek(selectedWeek, { weekStartsOn: 1 }), "MMM d, yyyy")}
                </CardTitle>
                <div className="mt-2">{getStatusBadge(timesheet.status)}</div>
              </div>
              <div className="space-x-2">
                {timesheet.status === "draft" && (
                  <>
                    <Button onClick={() => setSubmitDialogOpen(true)}>
                      <Send className="h-4 w-4 mr-2" />
                      Submit for Approval
                    </Button>
                    <Button variant="destructive" onClick={handleDeleteTimesheet}>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </>
                )}
                {timesheet.status === "submitted" && (
                  <Button variant="secondary" onClick={handleWithdraw}>
                    Withdraw Submission
                  </Button>
                )}
                {timesheet.status === "rejected" && (
                  <Button onClick={() => setSubmitDialogOpen(true)}>
                    Edit & Resubmit
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Total Hours</p>
                <p className="text-2xl font-bold">{timesheet.total_hours.toFixed(2)}h</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Billable Hours</p>
                <p className="text-2xl font-bold">{timesheet.billable_hours.toFixed(2)}h</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Entries</p>
                <p className="text-2xl font-bold">{timeEntries.length}</p>
              </div>
            </div>

            {/* Status Details */}
            {timesheet.status === "submitted" && (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="font-medium">Submitted on {format(new Date(timesheet.submitted_at!), "MMM d, yyyy 'at' h:mm a")}</p>
                <p className="text-sm text-muted-foreground">Waiting for Tech Lead approval</p>
              </div>
            )}

            {timesheet.status === "approved" && (
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="font-medium">✓ Approved by {timesheet.reviewer_email} on {format(new Date(timesheet.reviewed_at!), "MMM d, yyyy 'at' h:mm a")}</p>
                <p className="text-sm text-muted-foreground">Time entries are now locked</p>
              </div>
            )}

            {timesheet.status === "rejected" && timesheet.rejection_reason && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="font-medium">Rejected by {timesheet.reviewer_email} on {format(new Date(timesheet.reviewed_at!), "MMM d, yyyy 'at' h:mm a")}</p>
                <p className="text-sm mt-2">Reason: {timesheet.rejection_reason}</p>
              </div>
            )}

            {/* Time Entries Table */}
            <div className="border rounded-lg">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left">Date</th>
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
                      <td className="p-3">
                        {entry.task_code ? (
                          <span className="text-sm">
                            {entry.task_code} - {entry.task_title}
                            {entry.project_name && <span className="text-muted-foreground"> ({entry.project_name})</span>}
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
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 text-center">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No timesheet for this week yet</h3>
            {orphanedCount > 0 && (
              <p className="text-muted-foreground mb-4">
                You have {orphanedCount} time {orphanedCount === 1 ? "entry" : "entries"} from this week not in any timesheet
              </p>
            )}
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Timesheet
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateTimesheetDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        weekStart={selectedWeek}
        onSuccess={loadTimesheetData}
      />

      {timesheet && (
        <SubmitTimesheetDialog
          open={submitDialogOpen}
          onOpenChange={setSubmitDialogOpen}
          timesheet={timesheet}
          timeEntries={timeEntries}
          onSuccess={loadTimesheetData}
        />
      )}
    </div>
  );
}
