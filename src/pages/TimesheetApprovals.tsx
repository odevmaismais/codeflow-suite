import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ReviewTimesheetDialog } from "@/components/ReviewTimesheetDialog";

interface TimesheetForReview {
  id: string;
  user_id: string;
  user_email: string;
  week_start_date: string;
  week_end_date: string;
  status: string;
  total_hours: number;
  billable_hours: number;
  submitted_at: string;
  entry_count: number;
}

export default function TimesheetApprovals() {
  const [timesheets, setTimesheets] = useState<TimesheetForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTimesheet, setSelectedTimesheet] = useState<TimesheetForReview | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("submitted");

  useEffect(() => {
    loadTimesheets();
  }, [statusFilter]);

  const loadTimesheets = async () => {
    setLoading(true);
    try {
      const org = await getCurrentOrganization();
      if (!org) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all timesheets from organization that need review
      const query = supabase
        .from("timesheets")
        .select(`
          id,
          user_id,
          week_start_date,
          week_end_date,
          status,
          total_hours,
          billable_hours,
          submitted_at
        `)
        .eq("organization_id", org.id)
        .order("submitted_at", { ascending: false });

      if (statusFilter !== "all") {
        query.eq("status", statusFilter);
      } else {
        query.in("status", ["submitted", "approved", "rejected"]);
      }

      const { data: timesheetsData, error: timesheetsError } = await query;

      if (timesheetsError) throw timesheetsError;

      // Fetch user emails and entry counts
      const enrichedTimesheets = await Promise.all(
        (timesheetsData || []).map(async (ts) => {
          const [{ data: userData }, { count: entryCount }] = await Promise.all([
            supabase.rpc("get_user_email", { p_user_id: ts.user_id }),
            supabase
              .from("timesheet_entries")
              .select("*", { count: "exact", head: true })
              .eq("timesheet_id", ts.id)
          ]);

          return {
            ...ts,
            user_email: userData || "Unknown",
            entry_count: entryCount || 0
          };
        })
      );

      setTimesheets(enrichedTimesheets);
    } catch (error: any) {
      console.error("Error loading timesheets:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReview = (timesheet: TimesheetForReview) => {
    setSelectedTimesheet(timesheet);
    setReviewDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      submitted: "default",
      approved: "default",
      rejected: "destructive"
    };
    const colors: any = {
      submitted: "bg-yellow-500",
      approved: "bg-green-500",
      rejected: "bg-red-500"
    };
    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
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
            <BreadcrumbLink href="/timesheets">Timesheets</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Approvals</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Timesheet Approvals</h1>
          <p className="text-muted-foreground">Review and approve team timesheets</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={statusFilter === "submitted" ? "default" : "outline"}
            onClick={() => setStatusFilter("submitted")}
          >
            Pending
          </Button>
          <Button
            variant={statusFilter === "approved" ? "default" : "outline"}
            onClick={() => setStatusFilter("approved")}
          >
            Approved
          </Button>
          <Button
            variant={statusFilter === "rejected" ? "default" : "outline"}
            onClick={() => setStatusFilter("rejected")}
          >
            Rejected
          </Button>
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All
          </Button>
        </div>
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-6">Loading...</CardContent>
        </Card>
      ) : timesheets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-muted-foreground">No timesheets pending approval</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {timesheets.map((timesheet) => (
            <Card key={timesheet.id}>
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-medium">{timesheet.user_email}</h3>
                      {getStatusBadge(timesheet.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Week: {format(new Date(timesheet.week_start_date), "MMM d")} - {format(new Date(timesheet.week_end_date), "MMM d, yyyy")}
                    </p>
                    <div className="flex gap-6 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Hours:</span>{" "}
                        <span className="font-medium">{timesheet.total_hours.toFixed(2)}h</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Billable:</span>{" "}
                        <span className="font-medium">{timesheet.billable_hours.toFixed(2)}h</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Entries:</span>{" "}
                        <span className="font-medium">{timesheet.entry_count}</span>
                      </div>
                    </div>
                    {timesheet.submitted_at && (
                      <p className="text-xs text-muted-foreground">
                        Submitted: {format(new Date(timesheet.submitted_at), "MMM d, yyyy 'at' h:mm a")}
                      </p>
                    )}
                  </div>
                  <div>
                    {timesheet.status === "submitted" ? (
                      <Button onClick={() => handleReview(timesheet)}>Review</Button>
                    ) : (
                      <Button variant="secondary" onClick={() => handleReview(timesheet)}>
                        View Details
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedTimesheet && (
        <ReviewTimesheetDialog
          open={reviewDialogOpen}
          onOpenChange={setReviewDialogOpen}
          timesheet={selectedTimesheet}
          onSuccess={() => {
            setReviewDialogOpen(false);
            loadTimesheets();
          }}
        />
      )}
    </div>
  );
}
