import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, 
  Plus, 
  CheckSquare, 
  MessageSquare, 
  Paperclip,
  AlertCircle 
} from "lucide-react";
import { format } from "date-fns";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";

interface Task {
  id: string;
  code: string;
  title: string;
  status: string;
  priority: string;
  task_type: string;
  assigned_to: string | null;
  assignee_email: string | null;
  assignee_name: string | null;
  created_by: string;
  creator_email: string;
  creator_name: string | null;
  estimated_hours: number | null;
  actual_hours: number;
  due_date: string | null;
  project_id: string | null;
  project_name: string | null;
  parent_task_id: string | null;
  subtask_count: number;
  completed_subtask_count: number;
  comment_count: number;
  attachment_count: number;
}

const Tasks = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeOrg, setActiveOrg] = useState<any>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  
  // Unique filter options
  const [projects, setProjects] = useState<Array<{id: string; name: string}>>([]);
  const [assignees, setAssignees] = useState<Array<{id: string; name: string; email: string}>>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [tasks, statusFilter, priorityFilter, assigneeFilter, projectFilter]);

  async function loadData() {
    const org = await getCurrentOrganization();
    if (!org) {
      toast({
        title: "Error",
        description: "No active organization found",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }
    setActiveOrg(org);
    await loadTasks(org.id);
    setLoading(false);
  }

  async function loadTasks(orgId: string) {
    const { data, error } = await supabase
      .from("tasks")
      .select(`
        *,
        assignee:assigned_to (email, raw_user_meta_data),
        creator:created_by (email, raw_user_meta_data),
        project:projects (name),
        subtasks:tasks!parent_task_id (id, status),
        comments:task_comments (id),
        attachments:task_attachments (id)
      `)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .is("parent_task_id", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading tasks:", error);
      toast({
        title: "Error",
        description: "Failed to load tasks",
        variant: "destructive",
      });
      return;
    }

    const formattedTasks: Task[] = (data || []).map((task: any) => ({
      id: task.id,
      code: task.code,
      title: task.title,
      status: task.status,
      priority: task.priority,
      task_type: task.task_type,
      assigned_to: task.assigned_to,
      assignee_email: task.assignee?.email || null,
      assignee_name: task.assignee?.raw_user_meta_data?.full_name || null,
      created_by: task.created_by,
      creator_email: task.creator?.email || "",
      creator_name: task.creator?.raw_user_meta_data?.full_name || null,
      estimated_hours: task.estimated_hours,
      actual_hours: task.actual_hours || 0,
      due_date: task.due_date,
      project_id: task.project_id,
      project_name: task.project?.name || null,
      parent_task_id: task.parent_task_id,
      subtask_count: task.subtasks?.length || 0,
      completed_subtask_count: task.subtasks?.filter((s: any) => s.status === 'done').length || 0,
      comment_count: task.comments?.length || 0,
      attachment_count: task.attachments?.length || 0,
    }));

    setTasks(formattedTasks);

    // Extract unique projects and assignees
    const uniqueProjects = Array.from(
      new Map(
        formattedTasks
          .filter(t => t.project_id && t.project_name)
          .map(t => [t.project_id, { id: t.project_id!, name: t.project_name! }])
      ).values()
    );
    setProjects(uniqueProjects);

    const uniqueAssignees = Array.from(
      new Map(
        formattedTasks
          .filter(t => t.assigned_to)
          .map(t => [
            t.assigned_to, 
            { 
              id: t.assigned_to!, 
              name: t.assignee_name || t.assignee_email || "Unknown",
              email: t.assignee_email || ""
            }
          ])
      ).values()
    );
    setAssignees(uniqueAssignees);
  }

  function applyFilters() {
    let filtered = [...tasks];

    if (statusFilter !== "all") {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (priorityFilter !== "all") {
      filtered = filtered.filter(t => t.priority === priorityFilter);
    }

    if (assigneeFilter === "me") {
      filtered = filtered.filter(t => t.assigned_to === activeOrg?.user_id);
    } else if (assigneeFilter === "unassigned") {
      filtered = filtered.filter(t => !t.assigned_to);
    } else if (assigneeFilter !== "all") {
      filtered = filtered.filter(t => t.assigned_to === assigneeFilter);
    }

    if (projectFilter !== "all") {
      filtered = filtered.filter(t => t.project_id === projectFilter);
    }

    setFilteredTasks(filtered);
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, string> = {
      todo: "bg-gray-500",
      in_progress: "bg-blue-500",
      in_review: "bg-orange-500",
      blocked: "bg-red-500",
      done: "bg-green-500",
      archived: "bg-gray-400"
    };
    const labels: Record<string, string> = {
      todo: "To Do",
      in_progress: "In Progress",
      in_review: "In Review",
      blocked: "Blocked",
      done: "Done",
      archived: "Archived"
    };
    return <Badge className={variants[status]}>{labels[status]}</Badge>;
  }

  function getPriorityBadge(priority: string) {
    const variants: Record<string, string> = {
      low: "bg-gray-400",
      medium: "bg-blue-400",
      high: "bg-orange-400",
      urgent: "bg-red-500"
    };
    const labels: Record<string, string> = {
      low: "Low",
      medium: "Medium",
      high: "High",
      urgent: "Urgent"
    };
    return <Badge className={variants[priority]}>{labels[priority]}</Badge>;
  }

  function TaskCard({ task }: { task: Task }) {
    const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done';
    
    return (
      <Card 
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={() => navigate(`/tasks/${task.id}`)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-2">
            <Badge variant="outline" className="bg-blue-100 text-blue-800">
              {task.code}
            </Badge>
            <div className="flex gap-2">
              {getStatusBadge(task.status)}
              {getPriorityBadge(task.priority)}
            </div>
          </div>
          
          <h3 className="font-semibold text-lg mb-2">{task.title}</h3>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {task.assigned_to && (
              <div className="flex items-center gap-2">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className="text-xs">
                    {(task.assignee_name || task.assignee_email || "?")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span>{task.assignee_name || task.assignee_email}</span>
              </div>
            )}
            
            {task.subtask_count > 0 && (
              <div className="flex items-center gap-1">
                <CheckSquare className="h-4 w-4" />
                <span>{task.completed_subtask_count}/{task.subtask_count}</span>
              </div>
            )}
            
            {task.comment_count > 0 && (
              <div className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4" />
                <span>{task.comment_count}</span>
              </div>
            )}
            
            {task.attachment_count > 0 && (
              <div className="flex items-center gap-1">
                <Paperclip className="h-4 w-4" />
                <span>{task.attachment_count}</span>
              </div>
            )}
            
            {task.due_date && (
              <div className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
                {isOverdue && <AlertCircle className="h-4 w-4" />}
                <span>{format(new Date(task.due_date), "MMM d")}</span>
              </div>
            )}
            
            {task.estimated_hours && (
              <span>
                {task.estimated_hours}h / {task.actual_hours}h
              </span>
            )}
          </div>
          
          {task.project_name && (
            <div className="mt-2 text-xs text-muted-foreground">
              Project: {task.project_name}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  function BoardView() {
    const columns = [
      { id: 'todo', label: 'To Do', tasks: filteredTasks.filter(t => t.status === 'todo') },
      { id: 'in_progress', label: 'In Progress', tasks: filteredTasks.filter(t => t.status === 'in_progress') },
      { id: 'in_review', label: 'In Review', tasks: filteredTasks.filter(t => t.status === 'in_review') },
      { id: 'blocked', label: 'Blocked', tasks: filteredTasks.filter(t => t.status === 'blocked') },
      { id: 'done', label: 'Done', tasks: filteredTasks.filter(t => t.status === 'done') },
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {columns.map(column => (
          <div key={column.id} className="bg-muted/50 rounded-lg p-4">
            <h3 className="font-semibold mb-3">
              {column.label} ({column.tasks.length})
            </h3>
            <div className="space-y-3">
              {column.tasks.map(task => (
                <TaskCard key={task.id} task={task} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p>Loading tasks...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Dashboard
      </Button>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">Manage your tasks and subtasks</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Assignee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Assignees</SelectItem>
            <SelectItem value="me">Assigned to Me</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {assignees.map(assignee => (
              <SelectItem key={assignee.id} value={assignee.id}>
                {assignee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(project => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* View Toggle */}
      <Tabs defaultValue="list" className="w-full">
        <TabsList>
          <TabsTrigger value="list">List View</TabsTrigger>
          <TabsTrigger value="board">Board View</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-6">
          <div className="space-y-4">
            {filteredTasks.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No tasks found. Create your first task to get started!
              </p>
            ) : (
              filteredTasks.map(task => <TaskCard key={task.id} task={task} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="board" className="mt-6">
          <BoardView />
        </TabsContent>
      </Tabs>

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={() => {
          setCreateDialogOpen(false);
          loadData();
        }}
      />
    </div>
  );
};

export default Tasks;