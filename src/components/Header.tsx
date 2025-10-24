import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, ChevronDown, User, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentOrganization, getUserOrganizations, signOut } from "@/lib/auth";
import { toast } from "sonner";
import type { Organization } from "@/lib/auth";

export function Header() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      setUser({ email: authUser.email || "" });
    }

    const org = await getCurrentOrganization();
    setCurrentOrg(org);

    const orgs = await getUserOrganizations();
    setOrganizations(orgs);
  };

  const handleSwitchOrg = (orgId: string) => {
    localStorage.setItem("activeOrgId", orgId);
    window.location.reload();
  };

  const handleCreateOrg = async () => {
    if (!orgName.trim()) {
      toast.error("Digite um nome para a organização");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("organizations")
        .insert({
          name: orgName,
          slug: orgName.toLowerCase().replace(/\s+/g, "-"),
        })
        .select()
        .single();

      if (error) throw error;

      // Add current user as admin
      const { data: { user } } = await supabase.auth.getUser();
      if (user && data) {
        await supabase.from("user_organizations").insert({
          user_id: user.id,
          organization_id: data.id,
          role: "admin",
        });
      }

      toast.success("Organização criada com sucesso!");
      setCreateOrgOpen(false);
      setOrgName("");
      loadUserData();
    } catch (error: any) {
      console.error("Error creating organization:", error);
      toast.error("Erro ao criar organização");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-background border-b z-50 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold text-primary">DevFlow</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Organization Switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Building2 className="w-4 h-4" />
              <span>{currentOrg?.name || "Selecionar Organização"}</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Minhas Organizações</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => handleSwitchOrg(org.id)}
                className={currentOrg?.id === org.id ? "bg-accent" : ""}
              >
                <Building2 className="w-4 h-4 mr-2" />
                {org.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <Dialog open={createOrgOpen} onOpenChange={setCreateOrgOpen}>
              <DialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Organização
                </DropdownMenuItem>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Criar Nova Organização</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="orgName">Nome da Organização</Label>
                    <Input
                      id="orgName"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Ex: Minha Empresa"
                    />
                  </div>
                  <Button onClick={handleCreateOrg} disabled={loading} className="w-full">
                    {loading ? "Criando..." : "Criar Organização"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium">Minha Conta</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="w-4 h-4 mr-2" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-red-600">
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
