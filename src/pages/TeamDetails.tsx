import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentUser, getUserOrganizations } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Edit } from "lucide-react";
import { format } from "date-fns";

const TEAM_ROLES = [
  { value: "tech_lead", label: "Tech Lead" },
  { value: "developer", label: "Developer" },
  { value: "qa_tester", label: "QA Tester" },
  { value: "business_analyst", label: "Business Analyst" },
  { value: "scrum_master", label: "Scrum Master" },
  { value: "product_owner", label: "Product Owner" }
];

interface TeamMember {
  id: string;
  user_id: string;
  team_role: string;
  joined_at: string;
  email?: string;
}

export default function TeamDetails() {
  const { teamId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  const [activeOrg, setActiveOrg] = useState<any>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  
  const [editFormData, setEditFormData] = useState({
    name: "",
    description: ""
  });

  const [addMemberFormData, setAddMemberFormData] = useState({
    user_id: "",
    team_role: "developer"
  });

  useEffect(() => {
    loadData();
  }, [teamId]);

  async function loadData() {
    setLoading(true);
    const user = await getCurrentUser();
    if (!user) {
      navigate("/auth");
      return;
    }
    setCurrentUserId(user.id);

    const orgs = await getUserOrganizations();
    if (orgs.length === 0) {
      navigate("/onboarding");
      return;
    }

    const activeOrgId = localStorage.getItem("activeOrgId");
    const currentOrg = orgs.find(o => o.id === activeOrgId) || orgs[0];
    setActiveOrg(currentOrg);

    await Promise.all([
      loadTeam(),
      loadMembers(),
      loadOrgMembers(currentOrg.id)
    ]);

    setLoading(false);
  }

  async function loadTeam() {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .eq("id", teamId)
      .is("deleted_at", null)
      .single();

    if (error || !data) {
      toast({
        title: "Error",
        description: "Team not found",
        variant: "destructive"
      });
      navigate("/teams");
      return;
    }

    setTeam(data);
    setEditFormData({
      name: data.name,
      description: data.description || ""
    });
  }

  async function loadMembers() {
    const { data, error } = await supabase
      .from("team_members")
      .select("*")
      .eq("team_id", teamId);

    if (error) {
      console.error("Error loading members:", error);
      return;
    }

    setMembers(data || []);
  }

  async function loadOrgMembers(orgId: string) {
    const { data, error } = await supabase
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", orgId);

    if (error) {
      console.error("Error loading org members:", error);
      return;
    }

    setOrgMembers(data || []);
  }

  async function handleUpdateTeam() {
    if (editFormData.name.trim().length < 3) {
      toast({
        title: "Error",
        description: "Team name must be at least 3 characters",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("teams")
      .update({
        name: editFormData.name.trim(),
        description: editFormData.description.trim() || null
      })
      .eq("id", teamId);

    setIsSaving(false);

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
          description: "Failed to update team",
          variant: "destructive"
        });
      }
      return;
    }

    toast({
      title: "Success",
      description: "Team updated successfully"
    });

    setIsEditModalOpen(false);
    loadTeam();
  }

  async function handleAddMember() {
    if (!addMemberFormData.user_id) {
      toast({
        title: "Error",
        description: "Please select a user",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase
      .from("team_members")
      .insert({
        team_id: teamId,
        user_id: addMemberFormData.user_id,
        team_role: addMemberFormData.team_role
      });

    setIsSaving(false);

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Error",
          description: "User is already a member of this team",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to add member",
          variant: "destructive"
        });
      }
      return;
    }

    toast({
      title: "Success",
      description: "Member added successfully"
    });

    setIsAddMemberModalOpen(false);
    setAddMemberFormData({ user_id: "", team_role: "developer" });
    loadMembers();
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;

    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("id", memberToRemove);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive"
      });
      return;
    }

    toast({
      title: "Success",
      description: "Member removed from team"
    });

    setMemberToRemove(null);
    loadMembers();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const canManageTeam = activeOrg?.role === "admin" || activeOrg?.role === "manager" || members.some(m => m.user_id === currentUserId && m.team_role === "tech_lead");
  const availableMembers = orgMembers.filter(om => !members.some(m => m.user_id === om.user_id));

  return (
    <div className="container mx-auto py-8 px-4">
      <Button variant="ghost" onClick={() => navigate("/teams")} className="mb-4">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Teams
      </Button>

      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-bold">{team?.name}</h1>
          {team?.description && (
            <p className="text-muted-foreground mt-2">{team.description}</p>
          )}
        </div>
        {canManageTeam && (
          <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Edit className="w-4 h-4 mr-2" />
                Edit Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Team</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Team Name *</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-description">Description</Label>
                  <Textarea
                    id="edit-description"
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateTeam} disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>Manage members and their roles</CardDescription>
            </div>
            {canManageTeam && (
              <Dialog open={isAddMemberModalOpen} onOpenChange={setIsAddMemberModalOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Member to {team?.name}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="user">Select User *</Label>
                      <Select
                        value={addMemberFormData.user_id}
                        onValueChange={(value) => setAddMemberFormData({ ...addMemberFormData, user_id: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMembers.map((member) => (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              {member.user_id}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="role">Team Role *</Label>
                      <Select
                        value={addMemberFormData.team_role}
                        onValueChange={(value) => setAddMemberFormData({ ...addMemberFormData, team_role: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TEAM_ROLES.map((role) => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddMemberModalOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddMember} disabled={isSaving}>
                      {isSaving ? "Adding..." : "Add Member"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No members yet. Add members to start building your team.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User ID</TableHead>
                  <TableHead>Team Role</TableHead>
                  <TableHead>Joined Date</TableHead>
                  {canManageTeam && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="font-mono text-sm">{member.user_id}</TableCell>
                    <TableCell>
                      {TEAM_ROLES.find(r => r.value === member.team_role)?.label || member.team_role}
                    </TableCell>
                    <TableCell>{format(new Date(member.joined_at), "MMM d, yyyy")}</TableCell>
                    {canManageTeam && (
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMemberToRemove(member.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!memberToRemove} onOpenChange={() => setMemberToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this member from the team? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveMember}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
