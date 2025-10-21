import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, DollarSign, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { EditProjectDialog } from "@/components/EditProjectDialog";

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-500",
  active: "bg-green-500",
  on_hold: "bg-yellow-500",
  completed: "bg-blue-500",
  archived: "bg-gray-400"
};

interface AssignedTeam {
  id: string;
  team_id: string;
  team_name: string;
  assigned_at: string;
}

export default function ProjectDetails() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [assignedTeams, setAssignedTeams] = useState<AssignedTeam[]>([]);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [activeOrg, setActiveOrg] = useState<any>(null);
  
  const [isAssignTeamModalOpen, setIsAssignTeamModalOpen] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);
  const [teamToRemove, setTeamToRemove] = useState<string | null>(null);
  const [isTechLead, setIsTechLead] = useState(false);
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  async function loadData() {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) {
      navigate("/auth");
      return;
    }

    const orgs = await getUserOrganizations();
    if (orgs.length === 0) {
      navigate("/onboarding");
      return;
    }

    const activeOrgId = localStorage.getItem("activeOrgId");
    const currentOrg = orgs.find(o => o.id === activeOrgId) || orgs[0];
    setActiveOrg(currentOrg);

    await Promise.all([
      loadProject(),
      loadAssignedTeams(),
      loadAvailableTeams(currentOrg.id),
      checkIfTechLead(user.id)
    ]);

    setLoading(false);
  }

  async function checkIfTechLead(userId: string) {
    // First get all teams assigned to this project
    const { data: projectTeams } = await supabase
      .from("project_teams")
      .select("team_id")
      .eq("project_id", projectId);

    if (!projectTeams || projectTeams.length === 0) {
      setIsTechLead(false);
      return;
    }

    // Check if user is tech lead in any of those teams
    const teamIds = projectTeams.map(pt => pt.team_id);
    const { data: techLeadCheck } = await supabase
      .from("team_members")
      .select("id")
      .eq("user_id", userId)
      .in("team_id", teamIds)
      .eq("team_role", "tech_lead")
      .limit(1);

    setIsTechLead(!!techLeadCheck && techLeadCheck.length > 0);
  }

  async function loadProject() {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      toast({
        title: "Error",
        description: "Project not found",
        variant: "destructive"
      });
      navigate("/projects");
      return;
    }

    setProject(data);
  }

  async function loadAssignedTeams() {
    const { data, error } = await supabase
      .from("project_teams")
      .select(`
        id,
        team_id,
        assigned_at,
        teams(name)
      `)
      .eq("project_id", projectId);

    if (error) {
      console.error("Error loading assigned teams:", error);
      return;
    }

    const teamsData = (data || []).map((item: any) => ({
      id: item.id,
      team_id: item.team_id,
      team_name: item.teams?.name || "Unknown Team",
      assigned_at: item.assigned_at
    }));

    setAssignedTeams(teamsData);
  }

  async function loadAvailableTeams(orgId: string) {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null);

    if (error) {
      console.error("Error loading teams:", error);
      return;
    }

    setAvailableTeams(data || []);
  }

  async function handleAssignTeam() {
    if (!selectedTeamId) {
      toast({
        title: "Error",
        description: "Please select a team",
        variant: "destructive"
      });
      return;
    }

    setIsAssigning(true);

    const { error } = await supabase
      .from("project_teams")
      .insert({
        project_id: projectId,
        team_id: selectedTeamId
      });

    setIsAssigning(false);

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Error",
          description: "This team is already assigned to the project",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to assign team",
          variant: "destructive"
        });
      }
      return;
    }

    toast({
      title: "Success",
      description: "Team assigned to project"
    });

    setIsAssignTeamModalOpen(false);
    setSelectedTeamId("");
    loadAssignedTeams();
  }

  async function handleRemoveTeam() {
    if (!teamToRemove) return;

    const { error } = await supabase
      .from("project_teams")
      .delete()
      .eq("id", teamToRemove);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove team",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Success",
      description: "Team removed from project"
    });

    setTeamToRemove(null);
    loadAssignedTeams();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const canManageProject = activeOrg?.role === "admin" || activeOrg?.role === "manager" || isTechLead;
  const unassignedTeams = availableTeams.filter(t => !assignedTeams.some(at => at.team_id === t.id));

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => navigate("/projects")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Projects
      </Button>

      <div className="mb-6">
        <div className="flex items-start gap-4 mb-4">
          <Badge variant="secondary" className="text-sm font-mono">
            {project?.code}
          </Badge>
          <Badge className={STATUS_COLORS[project?.status]}>
            {project?.status.replace("_", " ").toUpperCase()}
          </Badge>
          {project?.is_billable && (
            <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20">
              <DollarSign className="w-3 h-3 mr-1" />
              Billable
            </Badge>
          )}
        </div>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{project?.name}</h1>
            {project?.description && (
              <p className="text-muted-foreground mt-2">{project.description}</p>
            )}
          </div>
          {canManageProject && (
            <Button variant="outline" onClick={() => setIsEditProjectOpen(true)}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit Project
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Start Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {project?.start_date ? format(new Date(project.start_date), "MMM d, yyyy") : "Not set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">End Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              {project?.end_date ? format(new Date(project.end_date), "MMM d, yyyy") : "Not set"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold capitalize">
              {project?.status.replace("_", " ")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Assigned Teams</CardTitle>
              <CardDescription>Teams working on this project</CardDescription>
            </div>
            {canManageProject && (
              <Dialog open={isAssignTeamModalOpen} onOpenChange={setIsAssignTeamModalOpen}>
                <DialogTrigger asChild>
                  <Button disabled={unassignedTeams.length === 0}>
                    <Plus className="w-4 h-4 mr-2" />
                    Assign Team
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Team to {project?.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a team" />
                        </SelectTrigger>
                        <SelectContent>
                          {unassignedTeams.map((team) => (
                            <SelectItem key={team.id} value={team.id}>
                              {team.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAssignTeamModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAssignTeam} disabled={isAssigning}>
                      {isAssigning ? "Assigning..." : "Assign Team"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {assignedTeams.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No teams assigned yet. Assign teams to start working on this project.
            </p>
          ) : (
            <div className="space-y-3">
              {assignedTeams.map((team) => (
                <div key={team.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{team.team_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Assigned {format(new Date(team.assigned_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  {canManageProject && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setTeamToRemove(team.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Tasks</CardTitle>
              <CardDescription>Project tasks and deliverables</CardDescription>
            </div>
            <Button onClick={() => navigate(`/tasks?project=${projectId}`)}>
              View All Tasks
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            View and manage all tasks for this project in the Tasks page.
          </p>
        </CardContent>
      </Card>

      <AlertDialog open={!!teamToRemove} onOpenChange={() => setTeamToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this team from the project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveTeam}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {project && (
        <EditProjectDialog
          open={isEditProjectOpen}
          onOpenChange={setIsEditProjectOpen}
          onSuccess={() => {
            loadProject();
            setIsEditProjectOpen(false);
          }}
          project={project}
        />
      )}
    </div>
  );
}
