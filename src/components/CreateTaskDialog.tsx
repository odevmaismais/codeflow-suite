import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization, getCurrentUser } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const taskSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(200, "Title must be at most 200 characters"),
  description: z.string().max(5000, "Description must be at most 5000 characters").optional(),
  project_id: z.string().optional(),
  parent_task_id: z.string().optional(),
  status: z.enum(["todo", "in_progress", "in_review", "blocked", "done", "archived"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  task_type: z.enum(["feature", "bug", "test", "documentation", "refactor", "spike"]),
  assigned_to: z.string().optional(),
  estimated_hours: z.string().optional(),
  due_date: z.date().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  projectId?: string;
  parentTaskId?: string;
}

export function CreateTaskDialog({ open, onOpenChange, onSuccess, projectId, parentTaskId }: CreateTaskDialogProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [parentTasks, setParentTasks] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(projectId);

  const form = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: "",
      project_id: projectId || "",
      parent_task_id: parentTaskId || "",
      status: "todo",
      priority: "medium",
      task_type: "feature",
      assigned_to: "",
      estimated_hours: "",
    },
  });

  useEffect(() => {
    if (open) {
      loadProjects();
      if (projectId) {
        setSelectedProjectId(projectId);
        loadParentTasks(projectId);
        loadTeamMembers(projectId);
      }
    }
  }, [open, projectId]);

  useEffect(() => {
    if (selectedProjectId) {
      loadParentTasks(selectedProjectId);
      loadTeamMembers(selectedProjectId);
    }
  }, [selectedProjectId]);

  async function loadProjects() {
    const org = await getCurrentOrganization();
    if (!org) return;

    const { data } = await supabase
      .from("projects")
      .select("id, name")
      .eq("organization_id", org.id)
      .is("deleted_at", null)
      .order("name");

    if (data) {
      setProjects(data);
    }
  }

  async function loadParentTasks(projectId: string) {
    const { data } = await supabase
      .from("tasks")
      .select("id, code, title")
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .is("deleted_at", null)
      .order("code");

    if (data) {
      setParentTasks(data);
    }
  }

  async function loadTeamMembers(projectId: string) {
    // Get team members from project teams
    const { data: projectTeams } = await supabase
      .from("project_teams")
      .select("team_id")
      .eq("project_id", projectId);

    if (!projectTeams || projectTeams.length === 0) {
      setTeamMembers([]);
      return;
    }

    const teamIds = projectTeams.map(pt => pt.team_id);
    
    // Use RPC function to get team members with emails
    const membersData = await Promise.all(
      teamIds.map(teamId => 
        supabase.rpc("get_team_members_with_emails", { p_team_id: teamId })
      )
    );

    const allMembers = membersData.flatMap(result => result.data || []);
    
    if (allMembers.length > 0) {
      const uniqueMembers = Array.from(
        new Map(
          allMembers.map((m: any) => [
            m.user_id,
            {
              id: m.user_id,
              name: m.email || "Unknown",
              email: m.email || ""
            }
          ])
        ).values()
      );
      setTeamMembers(uniqueMembers);
    } else {
      setTeamMembers([]);
    }
  }

  async function onSubmit(data: TaskFormData) {
    setSubmitting(true);

    try {
      const org = await getCurrentOrganization();
      const user = await getCurrentUser();
      
      if (!org || !user) {
        toast({
          title: "Error",
          description: "Authentication error",
          variant: "destructive",
        });
        return;
      }

      // Check task limit
      if (data.project_id) {
        const { data: canCreate } = await supabase.rpc("check_task_limit", {
          p_org_id: org.id,
          p_project_id: data.project_id
        });

        if (!canCreate) {
          toast({
            title: "Limit Reached",
            description: "Free plan allows max 50 tasks per project",
            variant: "destructive",
          });
          return;
        }
      }

      // Generate task code
      const { data: taskCode } = await supabase.rpc("generate_task_code", {
        p_org_id: org.id,
        p_project_id: data.project_id || null,
        p_parent_task_id: data.parent_task_id || null
      });

      // Create task
      const { data: newTask, error } = await supabase
        .from("tasks")
        .insert({
          organization_id: org.id,
          project_id: data.project_id || null,
          parent_task_id: data.parent_task_id || null,
          code: taskCode,
          title: data.title,
          description: data.description || null,
          status: data.status,
          priority: data.priority,
          task_type: data.task_type,
          assigned_to: data.assigned_to || null,
          created_by: user.id,
          estimated_hours: data.estimated_hours ? parseFloat(data.estimated_hours) : null,
          due_date: data.due_date ? format(data.due_date, "yyyy-MM-dd") : null,
        })
        .select()
        .single();

      if (error) throw error;

      // Add creator as watcher
      await supabase.rpc("add_watchers", {
        p_task_id: newTask.id,
        p_user_ids: [user.id]
      });

      // Add assignee as watcher
      if (data.assigned_to && data.assigned_to !== user.id) {
        await supabase.rpc("add_watchers", {
          p_task_id: newTask.id,
          p_user_ids: [data.assigned_to]
        });
      }

      toast({
        title: "Success",
        description: `Task ${taskCode} created successfully`,
      });

      form.reset();
      onSuccess();
      navigate(`/tasks/${newTask.id}`);
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Task</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Implement user authentication" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detailed requirements..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="project_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedProjectId(value);
                      }}
                      disabled={!!parentTaskId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects.map(project => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedProjectId && !parentTaskId && (
                <FormField
                  control={form.control}
                  name="parent_task_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parent Task (Subtask)</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select parent task" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {parentTasks.map(task => (
                            <SelectItem key={task.id} value={task.id}>
                              {task.code} - {task.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="todo">To Do</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="in_review">In Review</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                        <SelectItem value="done">Done</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="task_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="feature">Feature</SelectItem>
                        <SelectItem value="bug">Bug</SelectItem>
                        <SelectItem value="test">Test</SelectItem>
                        <SelectItem value="documentation">Documentation</SelectItem>
                        <SelectItem value="refactor">Refactor</SelectItem>
                        <SelectItem value="spike">Spike</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedProjectId && (
                <FormField
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Assign To</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select assignee" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {teamMembers.map(member => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="estimated_hours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estimated Hours</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        max="999.99"
                        placeholder="e.g., 8"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Due Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? format(field.value, "PPP") : "Pick a date"}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating..." : "Create Task"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}