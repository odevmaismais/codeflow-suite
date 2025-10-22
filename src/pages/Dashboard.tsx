import { PageLayout } from "@/components/PageLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Plus, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <PageLayout title="Dashboard">
      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-lg">
              <Play className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold">Start Timer</h3>
              <p className="text-sm text-muted-foreground">Track time on tasks</p>
            </div>
          </div>
          <Button className="w-full mt-4" onClick={() => navigate("/time-entries")}>
            Start Timer
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-500/10 rounded-lg">
              <Plus className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold">Create Task</h3>
              <p className="text-sm text-muted-foreground">Add new task</p>
            </div>
          </div>
          <Button className="w-full mt-4" variant="outline" onClick={() => navigate("/tasks")}>
            Create Task
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-lg">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold">Timesheets</h3>
              <p className="text-sm text-muted-foreground">Submit weekly hours</p>
            </div>
          </div>
          <Button className="w-full mt-4" variant="outline" onClick={() => navigate("/timesheets")}>
            View Timesheets
          </Button>
        </Card>
      </div>

      {/* Today's Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-2">Total Hours Today</div>
          <div className="text-3xl font-bold">0.0h</div>
          <div className="text-sm text-green-600 mt-2">+0% vs yesterday</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-2">Tasks Completed</div>
          <div className="text-3xl font-bold">0</div>
          <div className="text-sm text-muted-foreground mt-2">0 active tasks</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-2">Active Tasks</div>
          <div className="text-3xl font-bold">0</div>
          <div className="text-sm text-muted-foreground mt-2">In progress</div>
        </Card>

        <Card className="p-6">
          <div className="text-sm text-muted-foreground mb-2">Pending Timesheets</div>
          <div className="text-3xl font-bold">0</div>
          <div className="text-sm text-muted-foreground mt-2">Awaiting approval</div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
        <div className="text-center text-muted-foreground py-8">
          No recent activity. Start tracking time to see your activity here.
        </div>
      </Card>
    </PageLayout>
  );
}
