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
import { useToast } from "@/hooks/use-toast";
import { Users, Plus } from "lucide-react";
import { z } from "zod";

const teamSchema = z.object({
  name: z.string()
    .trim()
    .min(3, "Team name must be at least 3 characters")
    .max(50, "Team name must be at most 50 characters")
    .regex(/^[a-zA-Z0-9\s\-_]+$/, "Team name can only contain letters, numbers, spaces, hyphens, and underscores"),
  description: z.string().max(500, "Description must be at most 500 characters").optional()
});

interface Team {
  id: string;
  name: string;
  description: string | null;
  member_count: number;
}

export default function Teams() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeOrg, setActiveOrg] = useState<any>(null);
  const [canCreateTeam, setCanCreateTeam] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: ""
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadData();
  }, []);

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
      loadTeams(currentOrg.id),
      checkTeamLimit(currentOrg.id)
    ]);

    setLoading(false);
  }

  async function loadTeams(orgId: string) {
    const { data, error } = await supabase
      .from("teams")
      .select(`
        id,
        name,
        description,
        team_members(count)
      `)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading teams:", error);
      toast({
        title: "Error",
        description: "Failed to load teams",
        variant: "destructive"
      });
      return;
    }

    const teamsWithCount = (data || []).map((team: any) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      member_count: team.team_members[0]?.count || 0
    }));

    setTeams(teamsWithCount);
  }

  async function checkTeamLimit(orgId: string) {
    const { data, error } = await supabase.rpc("check_team_limit", {
      p_org_id: orgId
    });

    if (error) {
      console.error("Error checking team limit:", error);
      setCanCreateTeam(false);
      return;
    }

    setCanCreateTeam(data);
    setShowUpgradeBanner(!data);
  }

  async function handleCreateTeam() {
    setFormErrors({});

    const validation = teamSchema.safeParse(formData);
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

    setIsCreating(true);

    const { data, error } = await supabase
      .from("teams")
      .insert({
        organization_id: activeOrg.id,
        name: validation.data.name,
        description: validation.data.description || null
      })
      .select()
      .single();

    setIsCreating(false);

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Error",
          description: "A team with this name already exists",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create team",
          variant: "destructive"
        });
      }
      return;
    }

    toast({
      title: "Success",
      description: "Team created successfully"
    });

    setIsCreateModalOpen(false);
    setFormData({ name: "", description: "" });
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const canManageTeams = activeOrg?.role === "admin" || activeOrg?.role === "manager";

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Teams</h1>
          <p className="text-muted-foreground mt-1">Manage your organization's teams</p>
        </div>
        {canManageTeams && canCreateTeam && (
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Team</DialogTitle>
                <DialogDescription>
                  Create a new team to organize your organization members
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Team Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Backend Team"
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
                    placeholder="What does this team work on?"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                  />
                  {formErrors.description && (
                    <p className="text-sm text-destructive">{formErrors.description}</p>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTeam} disabled={isCreating}>
                  {isCreating ? "Creating..." : "Create Team"}
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
                You've reached the {activeOrg?.role === "admin" ? "Free" : ""} plan limit for teams.{" "}
                <Button variant="link" className="p-0 h-auto text-yellow-800 dark:text-yellow-200 underline" onClick={() => navigate("/settings")}>
                  Upgrade to Pro
                </Button>{" "}
                to create more teams.
              </p>
            </div>
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="w-12 h-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first team to start organizing your members
            </p>
            {canManageTeams && canCreateTeam && (
              <Button onClick={() => setIsCreateModalOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Team
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {teams.map((team) => (
            <Card key={team.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/teams/${team.id}`)}>
              <CardHeader>
                <CardTitle className="text-lg">{team.name}</CardTitle>
                {team.description && (
                  <CardDescription className="line-clamp-2">
                    {team.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {team.member_count} {team.member_count === 1 ? "member" : "members"}
                  </span>
                  <Button variant="ghost" size="sm">
                    View Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
