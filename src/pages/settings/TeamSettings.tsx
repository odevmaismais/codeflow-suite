import { useState, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization } from "@/lib/auth";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { Plus, Trash2, Copy, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";

interface Member {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
}

interface InviteCode {
  id: string;
  code: string;
  expires_at: string;
  used_count: number;
  max_uses: number | null;
  is_active: boolean;
  created_at: string;
}

export default function TeamSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    const loadUserAndOrg = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      
      setCurrentUserId(user.id);
      
      const org = await getCurrentOrganization();
      if (!org) {
        navigate("/onboarding");
        return;
      }
      
      setCurrentOrgId(org.id);
      setUserRole(org.role);
    };
    
    loadUserAndOrg();
  }, [navigate]);

  // Fetch Organization Members with emails
  const { data: members, isLoading: isLoadingMembers } = useQuery<Member[]>({
    queryKey: ["organizationMembers", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data, error } = await supabase.rpc("get_org_members_with_emails", {
        p_org_id: currentOrgId,
      });
      
      if (error) throw error;
      return data as Member[];
    },
    enabled: !!currentOrgId,
  });

  // Fetch Invite Codes
  const { data: inviteCodes, isLoading: isLoadingInviteCodes } = useQuery<InviteCode[]>({
    queryKey: ["inviteCodes", currentOrgId],
    queryFn: async () => {
      if (!currentOrgId) return [];
      const { data, error } = await supabase
        .from("invite_codes")
        .select("*")
        .eq("organization_id", currentOrgId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrgId,
  });

  // Mutation for generating invite code
  const generateInviteCodeMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrgId || !currentUserId) throw new Error("Missing organization or user ID.");
      
      // Generate code using database function
      const { data: codeData, error: codeError } = await supabase.rpc('generate_invite_code');
      if (codeError) throw codeError;
      
      const code = codeData as string;
      
      const { data, error } = await supabase
        .from("invite_codes")
        .insert({
          organization_id: currentOrgId,
          created_by: currentUserId,
          code: code,
          expires_at: addDays(new Date(), 7).toISOString(),
        })
        .select("code")
        .single();
      
      if (error) throw error;
      return data.code;
    },
    onSuccess: (code) => {
      queryClient.invalidateQueries({ queryKey: ["inviteCodes"] });
      toast.success(`Invite code generated: ${code}`);
      navigator.clipboard.writeText(code);
    },
    onError: (error: any) => {
      toast.error(`Failed to generate invite code: ${error.message}`);
    },
  });

  // Mutation for deleting invite code
  const deleteInviteCodeMutation = useMutation({
    mutationFn: async (id: string) => {
      console.log("Attempting to delete invite code:", id);
      const { error } = await supabase.from("invite_codes").delete().eq("id", id);
      if (error) {
        console.error("Delete error:", error);
        throw error;
      }
      console.log("Invite code deleted successfully");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inviteCodes"] });
      toast.success("Invite code deleted.");
    },
    onError: (error: any) => {
      console.error("Delete mutation error:", error);
      toast.error(`Failed to delete invite code: ${error.message}`);
    },
  });

  // Mutation for updating member role
  const updateMemberRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      if (!currentOrgId) throw new Error("Organization ID not found.");
      const { error } = await supabase
        .from("user_organizations")
        .update({ role: newRole })
        .eq("organization_id", currentOrgId)
        .eq("user_id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizationMembers"] });
      toast.success("Member role updated.");
    },
    onError: (error: any) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
  });

  // Mutation for removing member
  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!currentOrgId) throw new Error("Organization ID not found.");
      const { error } = await supabase
        .from("user_organizations")
        .delete()
        .eq("organization_id", currentOrgId)
        .eq("user_id", userId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizationMembers"] });
      toast.success("Member removed from organization.");
    },
    onError: (error: any) => {
      toast.error(`Failed to remove member: ${error.message}`);
    },
  });

  const isAdmin = userRole === "admin";
  const isAdminOrManager = userRole === "admin" || userRole === "manager";

  const breadcrumbs = [
    { label: "Home", href: "/dashboard" },
    { label: "Settings", href: "/settings/billing" },
    { label: "Team" },
  ];

  return (
    <PageLayout title="Team Settings" breadcrumbs={breadcrumbs}>
      <div className="space-y-8">
        {/* Organization Members */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Organization Members</h2>
            </div>
          </div>
          {isLoadingMembers ? (
            <p className="text-muted-foreground">Loading members...</p>
          ) : members && members.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.user_id}>
                    <TableCell className="font-medium">{member.email}</TableCell>
                    <TableCell>
                      <Select
                        value={member.role}
                        onValueChange={(newRole) => updateMemberRoleMutation.mutate({ userId: member.user_id, newRole })}
                        disabled={member.user_id === currentUserId || !isAdmin}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="member">Member</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{format(new Date(member.joined_at), "MMM d, yyyy")}</TableCell>
                    <TableCell className="text-right">
                      {member.user_id !== currentUserId && isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={removeMemberMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently remove this member from your organization.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeMemberMutation.mutate(member.user_id)}>Remove</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">No members in this organization yet.</p>
          )}
        </Card>

        {/* Invite Codes */}
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Invite Codes</h2>
            {isAdminOrManager && (
              <Button onClick={() => generateInviteCodeMutation.mutate()} disabled={generateInviteCodeMutation.isPending}>
                <Plus className="w-4 h-4 mr-2" /> Generate New Code
              </Button>
            )}
          </div>
          {isLoadingInviteCodes ? (
            <p className="text-muted-foreground">Loading invite codes...</p>
          ) : inviteCodes && inviteCodes.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Expires At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inviteCodes.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell className="font-mono font-semibold">{invite.code}</TableCell>
                    <TableCell>{format(new Date(invite.expires_at), "MMM d, yyyy hh:mm a")}</TableCell>
                    <TableCell>
                      {invite.is_active ? (
                        <span className="text-green-600 font-medium">Active</span>
                      ) : (
                        <span className="text-muted-foreground">Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {invite.used_count} {invite.max_uses ? `/ ${invite.max_uses}` : ""}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(invite.code);
                          toast.info("Invite code copied to clipboard!");
                        }}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      {isAdminOrManager && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={deleteInviteCodeMutation.isPending}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. This will permanently delete this invite code.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteInviteCodeMutation.mutate(invite.id)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">No invite codes generated yet.</p>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
