import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { FolderOpen, Plus, DollarSign, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { z } from "zod";
import { PageLayout } from "@/components/PageLayout";
import { CardSkeleton } from "@/components/CardSkeleton";

const projectSchema = z.object({
  code: z.string().regex(/^[A-Z]+-[0-9]+$/, "Project code must be uppercase letters, hyphen, then numbers (e.g., PROJ-001)").optional().or(z.literal("")),
  name: z.string().trim().min(3, "Project name must be at least 3 characters").max(100, "Project name must be at most 100 characters"),
  description: z.string().max(1000, "Description must be at most 1000 characters").optional(),
  status: z.enum(["planning", "active", "on_hold", "completed", "archived"]),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  is_billable: z.boolean()
});

const STATUS_COLORS: Record<string, string> = {
  planning: "bg-gray-500",
  active: "bg-green-500",
  on_hold: "bg-yellow-500",
  completed: "bg-blue-500",
  archived: "bg-gray-400"
};

interface Project {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  is_billable: boolean;
  teams_count: number;
}

export default function Projects() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [activeOrg, setActiveOrg] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("all");
  const [canCreateProject, setCanCreateProject] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [teams, setTeams] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    status: "planning" as const,
    start_date: "",
    end_date: "",
    is_billable: false,
    team_ids: [] as string[]
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterProjects();
  }, [activeTab, projects]);

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
      loadProjects(currentOrg.id),
      checkProjectLimit(currentOrg.id),
      loadTeams(currentOrg.id)
    ]);

    setLoading(false);
  }

  async function loadProjects(orgId: string) {
    const { data, error } = await supabase
      .from("projects")
      .select(`
        id,
        code,
        name,
        description,
        status,
        start_date,
        end_date,
        is_billable,
        project_teams(count)
      `)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading projects:", error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive"
      });
      return;
    }

    const projectsWithCount = (data || []).map((project: any) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
      start_date: project.start_date,
      end_date: project.end_date,
      is_billable: project.is_billable,
      teams_count: project.project_teams[0]?.count || 0
    }));

    setProjects(projectsWithCount);
  }

  async function loadTeams(orgId: string) {
    const { data, error } = await supabase
      .from("teams")
      .select("id, name")
      .eq("organization_id", orgId)
      .is("deleted_at", null);

    if (error) {
      console.error("Error loading teams:", error);
      return;
    }

    setTeams(data || []);
  }

  async function checkProjectLimit(orgId: string) {
    const { data, error } = await supabase.rpc("check_project_limit", {
      p_org_id: orgId
    });

    if (error) {
      console.error("Error checking project limit:", error);
      setCanCreateProject(false);
      return;
    }

    setCanCreateProject(data);
    setShowUpgradeBanner(!data);
  }

  function filterProjects() {
    if (activeTab === "all") {
      setFilteredProjects(projects);
    } else {
      setFilteredProjects(projects.filter(p => p.status === activeTab));
    }
  }

  async function handleCreateProject() {
    setFormErrors({});

    const validation = projectSchema.safeParse(formData);
    if (!validation.success) {
      const errors: Record<string, string> = {};
      validation.error.errors.forEach(err => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setFormErrors(errors);
      return;
    }

    if (formData.end_date && formData.start_date && new Date(formData.end_date) < new Date(formData.start_date)) {
      setFormErrors({ end_date: "End date must be after start date" });
      return;
    }

    setIsCreating(true);

    let projectCode = validation.data.code?.trim();
    if (!projectCode) {
      const { data: generatedCode, error: codeError } = await supabase.rpc("generate_project_code", {
        p_org_id: activeOrg.id
      });

      if (codeError || !generatedCode) {
        toast({
          title: "Error",
          description: "Failed to generate project code",
          variant: "destructive"
        });
        setIsCreating(false);
        return;
      }

      projectCode = generatedCode;
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({
        organization_id: activeOrg.id,
        code: projectCode,
        name: validation.data.name,
        description: validation.data.description || null,
        status: validation.data.status,
        start_date: validation.data.start_date || null,
        end_date: validation.data.end_date || null,
        is_billable: validation.data.is_billable
      })
      .select()
      .single();

    if (projectError) {
      setIsCreating(false);
      if (projectError.code === "23505") {
        toast({
          title: "Error",
          description: "A project with this code already exists",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create project",
          variant: "destructive"
        });
      }
      return;
    }

    if (formData.team_ids.length > 0 && project) {
      const teamInserts = formData.team_ids.map(team_id => ({
        project_id: project.id,
        team_id
      }));

      const { error: teamsError } = await supabase
        .from("project_teams")
        .insert(teamInserts);

      if (teamsError) {
        console.error("Error assigning teams:", teamsError);
      }
    }

    setIsCreating(false);

    toast({
      title: "Success",
      description: "Project created successfully"
    });

    setIsCreateModalOpen(false);
    setFormData({
      code: "",
      name: "",
      description: "",
      status: "planning",
      start_date: "",
      end_date: "",
      is_billable: false,
      team_ids: []
    });
    
    if (project) {
      navigate(`/projects/${project.id}`);
    }
  }

  if (loading) {
    return (
      <PageLayout>
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold">Projects</h1>
              <p className="text-muted-foreground mt-1">Manage your organization's projects</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      </PageLayout>
    );
  }

  const canManageProjects = activeOrg?.role === "admin" || activeOrg?.role === "manager";

  return (
    <PageLayout 
      title="Projects"
      breadcrumbs={[
        { label: "Home", href: "/dashboard" },
        { label: "Projects" }
      ]}
    >
      <div className="space-y-6">
        <p className="text-muted-foreground">Manage your organization's projects</p>
        {canManageProjects && canCreateProject && (
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>
                  Create a new project to track work and manage teams
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="code">Project Code</Label>
                    <Input
                      id="code"
                      placeholder="PROJ-001 (auto-generated if empty)"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                    />
                    {formErrors.code && (
                      <p className="text-sm text-destructive">{formErrors.code}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">Status *</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: any) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planning">Planning</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="on_hold">On Hold</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Project Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., API Refactor"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  {formErrors.name && (
                    <p className="text-sm text-destructive">{formErrors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Project goals and scope"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                  {formErrors.description && (
                    <p className="text-sm text-destructive">{formErrors.description}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start_date">Start Date</Label>
                    <Input
                      id="start_date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end_date">End Date</Label>
                    <Input
                      id="end_date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      disabled={!formData.start_date}
                    />
                    {formErrors.end_date && (
                      <p className="text-sm text-destructive">{formErrors.end_date}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_billable"
                    checked={formData.is_billable}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_billable: !!checked })}
                  />
                  <Label htmlFor="is_billable" className="cursor-pointer">
                    Is Billable
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label>Assign Teams (optional)</Label>
                  <div className="space-y-2">
                    {teams.map((team) => (
                      <div key={team.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`team-${team.id}`}
                          checked={formData.team_ids.includes(team.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFormData({ ...formData, team_ids: [...formData.team_ids, team.id] });
                            } else {
                              setFormData({ ...formData, team_ids: formData.team_ids.filter(id => id !== team.id) });
                            }
                          }}
                        />
                        <Label htmlFor={`team-${team.id}`} className="cursor-pointer">
                          {team.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateProject} disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Project"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {showUpgradeBanner && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                You've reached the plan limit for projects.{" "}
                <Button variant="link" className="p-0 h-auto text-yellow-800 dark:text-yellow-200 underline" onClick={() => navigate("/settings")}>
                  Upgrade to Pro
                </Button>{" "}
                to create more projects.
              </p>
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="on_hold">On Hold</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>
      </Tabs>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FolderOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first project to start tracking work
            </p>
            {canManageProjects && canCreateProject && (
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredProjects.map((project) => (
            <Card key={project.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/projects/${project.id}`)}>
              <CardHeader>
                <div className="flex items-start justify-between mb-2">
                  <Badge variant="secondary" className="text-xs font-mono">
                    {project.code}
                  </Badge>
                  <div className="flex gap-2">
                    <Badge className={STATUS_COLORS[project.status]}>
                      {project.status.replace("_", " ").toUpperCase()}
                    </Badge>
                    {project.is_billable && (
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20">
                        <DollarSign className="w-3 h-3 mr-1" />
                        Billable
                      </Badge>
                    )}
                  </div>
                </div>
                <CardTitle className="text-xl">{project.name}</CardTitle>
                {project.description && (
                  <CardDescription className="line-clamp-3 mt-2">
                    {project.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {project.teams_count} {project.teams_count === 1 ? "team" : "teams"}
                  </span>
                  {project.start_date && project.end_date && (
                    <span>
                      {format(new Date(project.start_date), "MMM d")} - {format(new Date(project.end_date), "MMM d, yyyy")}
                    </span>
                  )}
                  {!project.start_date && !project.end_date && (
                    <span>No dates set</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
