import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization, getCurrentUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { 
  Home, 
  MessageSquare, 
  Paperclip,
  Eye,
  Send,
  Download,
  Trash2
} from "lucide-react";
import { format } from "date-fns";
import { CreateTaskDialog } from "@/components/CreateTaskDialog";

interface TaskDetails {
  id: string;
  code: string;
  title: string;
  description: string | null;
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
  completed_at: string | null;
  created_at: string;
  project_id: string | null;
  project_name: string | null;
  parent_task_id: string | null;
}

interface Subtask {
  id: string;
  code: string;
  title: string;
  status: string;
  assignee_name: string | null;
  assignee_email: string | null;
}

interface Comment {
  id: string;
  content: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  created_at: string;
}

interface Attachment {
  id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  file_url: string;
  uploaded_by: string;
  uploader_email: string;
  uploader_name: string | null;
  created_at: string;
}

interface Watcher {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
}

interface OrgMember {
  id: string;
  email: string;
}

const TaskDetails = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [watchers, setWatchers] = useState<Watcher[]>([]);
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [activeOrg, setActiveOrg] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [createSubtaskOpen, setCreateSubtaskOpen] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [isWatching, setIsWatching] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionPosition, setMentionPosition] = useState(0);

  useEffect(() => {
    loadData();
  }, [taskId]);

  async function loadData() {
    const org = await getCurrentOrganization();
    const user = await getCurrentUser();
    
    if (!org || !user) {
      toast({
        title: "Error",
        description: "Authentication error",
        variant: "destructive",
      });
      navigate("/dashboard");
      return;
    }

    setActiveOrg(org);
    setCurrentUser(user);

    await Promise.all([
      loadTask(org.id, user.id),
      loadSubtasks(),
      loadComments(),
      loadAttachments(),
      loadWatchers(user.id),
      loadOrgMembers(org.id),
    ]);

    setLoading(false);
  }

  async function loadTask(orgId: string, userId: string) {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      console.error("Error loading task:", error);
      toast({
        title: "Error",
        description: "Task not found",
        variant: "destructive",
      });
      navigate("/tasks");
      return;
    }

    // Get assignee email
    const assigneeEmail = data.assigned_to 
      ? (await supabase.rpc("get_user_email", { p_user_id: data.assigned_to })).data
      : null;

    // Get creator email
    const creatorEmail = (await supabase.rpc("get_user_email", { p_user_id: data.created_by })).data;

    // Get project name
    let projectName = null;
    if (data.project_id) {
      const { data: projectData } = await supabase
        .from("projects")
        .select("name")
        .eq("id", data.project_id)
        .single();
      projectName = projectData?.name;
    }

    const taskData: TaskDetails = {
      id: data.id,
      code: data.code,
      title: data.title,
      description: data.description,
      status: data.status,
      priority: data.priority,
      task_type: data.task_type,
      assigned_to: data.assigned_to,
      assignee_email: assigneeEmail,
      assignee_name: assigneeEmail,
      created_by: data.created_by,
      creator_email: creatorEmail || "",
      creator_name: creatorEmail || "",
      estimated_hours: data.estimated_hours,
      actual_hours: data.actual_hours,
      due_date: data.due_date,
      completed_at: data.completed_at,
      created_at: data.created_at,
      project_id: data.project_id,
      project_name: projectName,
      parent_task_id: data.parent_task_id,
    };

    setTask(taskData);

    // Check if user can edit
    const canEditTask = 
      data.assigned_to === userId ||
      data.created_by === userId ||
      (await checkTechLead(userId, data.project_id));
    
    setCanEdit(canEditTask);

    // Load team members if project exists
    if (data.project_id) {
      await loadTeamMembers(data.project_id);
    }
  }

  async function checkTechLead(userId: string, projectId: string | null): Promise<boolean> {
    if (!projectId) return false;

    const { data } = await supabase
      .from("project_teams")
      .select("team_id")
      .eq("project_id", projectId);

    if (!data || data.length === 0) return false;

    const teamIds = data.map(pt => pt.team_id);
    const { data: techLeadCheck } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .in("team_id", teamIds)
      .eq("team_role", "tech_lead")
      .limit(1);

    return !!techLeadCheck && techLeadCheck.length > 0;
  }

  async function loadTeamMembers(projectId: string) {
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
            }
          ])
        ).values()
      );
      setTeamMembers(uniqueMembers);
    } else {
      setTeamMembers([]);
    }
  }

  async function loadSubtasks() {
    const { data } = await supabase
      .from("tasks")
      .select("id, code, title, status, assigned_to")
      .eq("parent_task_id", taskId)
      .is("deleted_at", null)
      .order("code");

    if (data) {
      const subtasksWithNames = await Promise.all(
        data.map(async (s: any) => {
          let assigneeName = null;
          let assigneeEmail = null;
          
          if (s.assigned_to) {
            const email = (await supabase.rpc("get_user_email", { p_user_id: s.assigned_to })).data;
            assigneeName = email;
            assigneeEmail = email;
          }

          return {
            id: s.id,
            code: s.code,
            title: s.title,
            status: s.status,
            assignee_name: assigneeName,
            assignee_email: assigneeEmail,
          };
        })
      );
      setSubtasks(subtasksWithNames);
    }
  }

  async function loadComments() {
    const { data } = await supabase
      .from("task_comments")
      .select("id, content, user_id, created_at")
      .eq("task_id", taskId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data) {
      const commentsWithUsers = await Promise.all(
        data.map(async (c: any) => {
          const email = (await supabase.rpc("get_user_email", { p_user_id: c.user_id })).data;
          return {
            id: c.id,
            content: c.content,
            user_id: c.user_id,
            user_email: email || "",
            user_name: email || "",
            created_at: c.created_at,
          };
        })
      );
      setComments(commentsWithUsers);
    }
  }

  async function loadAttachments() {
    const { data } = await supabase
      .from("task_attachments")
      .select("id, file_name, file_size, file_type, file_url, uploaded_by, created_at")
      .eq("task_id", taskId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data) {
      const attachmentsWithUsers = await Promise.all(
        data.map(async (a: any) => {
          const email = (await supabase.rpc("get_user_email", { p_user_id: a.uploaded_by })).data;
          return {
            id: a.id,
            file_name: a.file_name,
            file_size: a.file_size,
            file_type: a.file_type,
            file_url: a.file_url,
            uploaded_by: a.uploaded_by,
            uploader_email: email || "",
            uploader_name: email || "",
            created_at: a.created_at,
          };
        })
      );
      setAttachments(attachmentsWithUsers);
    }
  }

  async function loadWatchers(userId: string) {
    const { data } = await supabase
      .from("task_watchers")
      .select("id, user_id")
      .eq("task_id", taskId);

    if (data) {
      const watchersWithUsers = await Promise.all(
        data.map(async (w: any) => {
          const email = (await supabase.rpc("get_user_email", { p_user_id: w.user_id })).data;
          return {
            id: w.id,
            user_id: w.user_id,
            user_email: email || "",
            user_name: email || "",
          };
        })
      );
      setWatchers(watchersWithUsers);
      setIsWatching(data.some(w => w.user_id === userId));
    }
  }

  async function loadOrgMembers(orgId: string) {
    const { data } = await supabase.rpc("get_org_members_with_emails", {
      p_org_id: orgId
    });

    if (data) {
      setOrgMembers(data.map((m: any) => ({
        id: m.user_id,
        email: m.email
      })));
    }
  }

  async function updateTaskField(field: string, value: any) {
    if (!canEdit) {
      toast({
        title: "Permission Denied",
        description: "You don't have permission to edit this task",
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabase
      .from("tasks")
      .update({ [field]: value })
      .eq("id", taskId);

    if (error) {
      console.error("Error updating task:", error);
      toast({
        title: "Error",
        description: "Failed to update task",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Task updated",
      });
      loadData();
    }
  }

  function handleCommentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setNewComment(value);

    // Check for @ mention
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      if (!textAfterAt.includes(" ")) {
        setMentionSearch(textAfterAt);
        setMentionPosition(lastAtIndex);
        setShowMentions(true);
        return;
      }
    }
    setShowMentions(false);
  }

  function insertMention(member: OrgMember) {
    const before = newComment.slice(0, mentionPosition);
    const after = newComment.slice(mentionPosition + mentionSearch.length + 1);
    setNewComment(before + "@" + member.email + " " + after);
    setShowMentions(false);
  }

  const filteredMembers = orgMembers.filter(m =>
    m.email.toLowerCase().includes(mentionSearch.toLowerCase())
  );

  async function handleAddComment() {
    if (!newComment.trim()) return;

    const { error } = await supabase
      .from("task_comments")
      .insert({
        task_id: taskId,
        user_id: currentUser.id,
        content: newComment,
      });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    } else {
      setNewComment("");
      loadComments();
      toast({
        title: "Success",
        description: "Comment added",
      });
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (10MB)
    if (file.size > 10485760) {
      toast({
        title: "Error",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);

    try {
      // Upload to storage
      const fileName = `${taskId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("task-attachments")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("task-attachments")
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase
        .from("task_attachments")
        .insert({
          task_id: taskId,
          uploaded_by: currentUser.id,
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
          file_url: publicUrl,
        });

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "File uploaded successfully",
      });

      loadAttachments();
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  }

  async function handleDeleteAttachment(attachmentId: string, fileUrl: string) {
    try {
      // Extract file path from URL
      const urlParts = fileUrl.split("/task-attachments/");
      if (urlParts.length > 1) {
        const filePath = urlParts[1];
        
        // Delete from storage
        await supabase.storage
          .from("task-attachments")
          .remove([filePath]);
      }

      // Delete from database
      const { error } = await supabase
        .from("task_attachments")
        .delete()
        .eq("id", attachmentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Attachment deleted",
      });

      loadAttachments();
    } catch (error: any) {
      console.error("Error deleting attachment:", error);
      toast({
        title: "Error",
        description: "Failed to delete attachment",
        variant: "destructive",
      });
    }
  }

  async function toggleWatch() {
    if (isWatching) {
      const { error } = await supabase
        .from("task_watchers")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", currentUser.id);

      if (!error) {
        setIsWatching(false);
        loadWatchers(currentUser.id);
      }
    } else {
      const { error } = await supabase
        .from("task_watchers")
        .insert({
          task_id: taskId,
          user_id: currentUser.id,
        });

      if (!error) {
        setIsWatching(true);
        loadWatchers(currentUser.id);
      }
    }
  }

  if (loading || !task) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p>Loading task...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Breadcrumb Navigation */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">
                <Home className="h-4 w-4" />
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {task.project_id && task.project_name && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/projects">Projects</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to={`/projects/${task.project_id}`}>{task.project_name}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/tasks">Tasks</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-semibold">{task.code}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-blue-100 text-blue-800">
            {task.code}
          </Badge>
          <h1 className="text-2xl font-bold">{task.title}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              {task.description ? (
                <p className="whitespace-pre-wrap">{task.description}</p>
              ) : (
                <p className="text-muted-foreground italic">No description provided</p>
              )}
            </CardContent>
          </Card>

          {/* Details */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <Select
                    value={task.status}
                    onValueChange={(value) => updateTaskField("status", value)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="in_review">In Review</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Select
                    value={task.priority}
                    onValueChange={(value) => updateTaskField("priority", value)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium">Type</label>
                  <p className="text-sm mt-2 capitalize">{task.task_type.replace('_', ' ')}</p>
                </div>

                <div>
                  <label className="text-sm font-medium">Assignee</label>
                  {canEdit && task.project_id ? (
                    <Select
                      value={task.assigned_to || undefined}
                      onValueChange={(value) => updateTaskField("assigned_to", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers.map(member => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm mt-2">
                      {task.assignee_name || task.assignee_email || "Unassigned"}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Estimated Hours</label>
                  <p className="text-sm mt-2">{task.estimated_hours || "-"}</p>
                </div>

                <div>
                  <label className="text-sm font-medium">Actual Hours</label>
                  <p className="text-sm mt-2">{task.actual_hours}</p>
                </div>

                <div>
                  <label className="text-sm font-medium">Due Date</label>
                  <p className="text-sm mt-2">
                    {task.due_date ? format(new Date(task.due_date), "PPP") : "-"}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium">Created By</label>
                  <p className="text-sm mt-2">
                    {task.creator_name || task.creator_email} on{" "}
                    {format(new Date(task.created_at), "PPP")}
                  </p>
                </div>

                {task.completed_at && (
                  <div>
                    <label className="text-sm font-medium">Completed At</label>
                    <p className="text-sm mt-2">
                      {format(new Date(task.completed_at), "PPP")}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Subtasks */}
          {!task.parent_task_id && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>
                    Subtasks ({subtasks.filter(s => s.status === 'done').length}/{subtasks.length})
                  </CardTitle>
                  <Button size="sm" onClick={() => setCreateSubtaskOpen(true)}>
                    Add Subtask
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {subtasks.length === 0 ? (
                  <p className="text-muted-foreground italic">No subtasks</p>
                ) : (
                  <div className="space-y-2">
                    {subtasks.map(subtask => (
                      <div
                        key={subtask.id}
                        className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer"
                        onClick={() => navigate(`/tasks/${subtask.id}`)}
                      >
                        <Badge variant={subtask.status === 'done' ? 'default' : 'outline'}>
                          {subtask.code}
                        </Badge>
                        <span className="flex-1">{subtask.title}</span>
                        {subtask.assignee_name && (
                          <span className="text-sm text-muted-foreground">
                            {subtask.assignee_name}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle>Comments ({comments.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Add a comment... Use @ to mention"
                    value={newComment}
                    onChange={handleCommentChange}
                    className="min-h-[80px]"
                  />
                  <Button onClick={handleAddComment} size="icon">
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {showMentions && filteredMembers.length > 0 && (
                  <Card className="absolute z-10 mt-1 w-64 max-h-48 overflow-auto">
                    <CardContent className="p-2">
                      {filteredMembers.map(member => (
                        <div
                          key={member.id}
                          className="px-3 py-2 hover:bg-muted cursor-pointer rounded"
                          onClick={() => insertMention(member)}
                        >
                          {member.email}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="space-y-4">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {(comment.user_name || comment.user_email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">
                          {comment.user_name || comment.user_email}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(comment.created_at), "PPP")}
                        </span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Watchers */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Watchers ({watchers.length})</CardTitle>
                <Button size="sm" variant="outline" onClick={toggleWatch}>
                  <Eye className="w-4 h-4 mr-2" />
                  {isWatching ? "Unwatch" : "Watch"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {watchers.map(watcher => (
                  <div key={watcher.id} className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {(watcher.user_name || watcher.user_email)[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm">
                      {watcher.user_name || watcher.user_email}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Attachments */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Attachments ({attachments.length})</CardTitle>
                <div>
                  <input
                    type="file"
                    id="file-upload"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".jpg,.jpeg,.png,.pdf,.txt,.md,.doc,.docx,.xls,.xlsx"
                  />
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => document.getElementById("file-upload")?.click()}
                    disabled={uploadingFile}
                  >
                    <Paperclip className="w-4 h-4 mr-2" />
                    {uploadingFile ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {attachments.length === 0 ? (
                <p className="text-muted-foreground italic text-sm">No attachments</p>
              ) : (
                <div className="space-y-2">
                  {attachments.map(attachment => (
                    <div key={attachment.id} className="flex items-center justify-between p-2 rounded hover:bg-muted">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{attachment.file_name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{(attachment.file_size / 1024 / 1024).toFixed(2)} MB</span>
                          <span>•</span>
                          <span>{attachment.uploader_name}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => window.open(attachment.file_url, '_blank')}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {attachment.uploaded_by === currentUser?.id && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteAttachment(attachment.id, attachment.file_url)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateTaskDialog
        open={createSubtaskOpen}
        onOpenChange={setCreateSubtaskOpen}
        onSuccess={() => {
          setCreateSubtaskOpen(false);
          loadSubtasks();
        }}
        projectId={task.project_id || undefined}
        parentTaskId={task.id}
      />
    </div>
  );
};

export default TaskDetails;
