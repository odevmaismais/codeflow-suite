import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { CreditCard, Check, X, Download, ExternalLink, Sparkles } from "lucide-react";
import { UpgradeToPro } from "@/components/UpgradeToPro";
import { CancelSubscription } from "@/components/CancelSubscription";
import { PageLayout } from '@/components/PageLayout';

interface Subscription {
  id: string;
  plan: string;
  status: string;
  trial_start: string | null;
  trial_end: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
}

interface Usage {
  team_count: number;
  project_count: number;
  task_count: number;
  time_entry_count_month: number;
}

interface Invoice {
  id: string;
  stripe_invoice_id: string;
  amount_paid: number;
  currency: string;
  status: string;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
  created_at: string;
}

export default function Billing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [currentOrg, setCurrentOrg] = useState<any>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    loadBillingData();
    
    // Check for success/cancel params
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      toast.success('Subscription activated successfully!');
      window.history.replaceState({}, '', '/settings/billing');
    } else if (params.get('canceled') === 'true') {
      toast.error('Checkout canceled');
      window.history.replaceState({}, '', '/settings/billing');
    }
  }, []);

  const loadBillingData = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      // Get user's organizations with role
      const { data: userOrgs, error: userOrgsError } = await supabase
        .from("user_organizations")
        .select("organization_id, role, organizations(*)")
        .eq("user_id", user.id);

      if (userOrgsError) throw userOrgsError;
      if (!userOrgs || userOrgs.length === 0) {
        navigate("/onboarding");
        return;
      }

      // Get active org from localStorage or first org
      const activeOrgId = localStorage.getItem("activeOrgId") || userOrgs[0].organization_id;
      const activeOrg = userOrgs.find((uo: any) => uo.organization_id === activeOrgId);
      
      if (!activeOrg) {
        toast.error("Organization not found");
        return;
      }

      setCurrentOrg(activeOrg.organizations);
      setUserRole(activeOrg.role);

      // Check if user is admin
      if (activeOrg.role !== "admin") {
        toast.error("Only admins can access billing settings");
        navigate("/dashboard");
        return;
      }

      // Load subscription
      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("organization_id", activeOrgId)
        .single();

      if (subError) throw subError;
      setSubscription(subData);

      // Load usage stats
      const { data: usageData, error: usageError } = await supabase
        .rpc("get_subscription_usage", { p_org_id: activeOrgId });

      if (usageError) throw usageError;
      if (usageData && usageData.length > 0) {
        setUsage(usageData[0]);
      }

      // Load invoices if Pro plan
      if (subData.plan === "pro") {
        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .select("*")
          .eq("organization_id", activeOrgId)
          .order("created_at", { ascending: false })
          .limit(12);

        if (!invoiceError && invoiceData) {
          setInvoices(invoiceData);
        }
      }

    } catch (error: any) {
      console.error("Error loading billing data:", error);
      toast.error("Failed to load billing data");
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      if (!subscription?.stripe_customer_id) {
        toast.error("No customer ID found");
        return;
      }

      // Create billing portal session
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { customer_id: subscription.stripe_customer_id }
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      console.error("Error opening billing portal:", error);
      toast.error("Failed to open billing portal");
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; label: string }> = {
      active: { variant: "default", label: "Active" },
      trialing: { variant: "secondary", label: "Trial" },
      past_due: { variant: "destructive", label: "Past Due" },
      canceled: { variant: "outline", label: "Canceled" },
    };
    const config = statusMap[status] || { variant: "outline", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getTrialDaysRemaining = () => {
    if (!subscription?.trial_end) return 0;
    const end = new Date(subscription.trial_end);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading billing...</p>
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="container mx-auto p-6">
        <p>No subscription found</p>
      </div>
    );
  }

  const isFree = subscription.plan === "free";
  const isPro = subscription.plan === "pro";
  const isTrialing = subscription.status === "trialing";

  return (
    <PageLayout 
      title="Billing & Subscription"
      breadcrumbs={[
        { label: "Home", href: "/dashboard" },
        { label: "Settings", href: "/settings" },
        { label: "Billing" }
      ]}
    >
      <div className="max-w-6xl">
      <p className="text-muted-foreground mb-8">Manage your plan and payment methods</p>

      {/* Current Plan Card */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Current Plan</h2>
          {getStatusBadge(subscription.status)}
        </div>

        <div className="space-y-4">
          {isFree && !isTrialing && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-lg px-3 py-1">Free Plan</Badge>
              </div>
              <p className="text-muted-foreground">You're on the Free plan</p>
              
              <div className="space-y-2 my-4">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>1 team</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>3 projects</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>50 tasks per project</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>100 time entries per month</span>
                </div>
              </div>

              <Button onClick={() => setShowUpgradeModal(true)} size="lg" className="w-full sm:w-auto">
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade to Pro
              </Button>
            </>
          )}

          {isPro && !isTrialing && (
            <>
              <div className="flex items-center gap-2">
                <Badge className="text-lg px-3 py-1">
                  <Sparkles className="h-4 w-4 mr-1" />
                  Pro Plan
                </Badge>
              </div>
              <p className="text-muted-foreground">You're on the Pro plan</p>
              
              <div className="space-y-2 my-4">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Unlimited teams</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Unlimited projects</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Unlimited tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Unlimited time entries</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <span>Priority support</span>
                </div>
              </div>

              {subscription.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  {subscription.cancel_at_period_end 
                    ? `Your subscription will end on ${formatDate(subscription.current_period_end)}`
                    : `Renews on ${formatDate(subscription.current_period_end)}`
                  }
                </p>
              )}

              <div className="flex gap-3 mt-4">
                {subscription.stripe_customer_id && (
                  <Button onClick={handleManageSubscription} variant="outline">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Manage Subscription
                  </Button>
                )}
                {!subscription.cancel_at_period_end && (
                  <Button onClick={() => setShowCancelModal(true)} variant="outline">
                    Cancel Subscription
                  </Button>
                )}
              </div>
            </>
          )}

          {isTrialing && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  <Sparkles className="h-4 w-4 mr-1" />
                  Pro Plan Trial
                </Badge>
              </div>
              <p className="text-muted-foreground">You're on a 14-day trial of Pro plan</p>
              
              <div className="bg-muted/50 p-4 rounded-lg my-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">{getTrialDaysRemaining()} days remaining</span>
                  <span className="text-sm text-muted-foreground">
                    Ends {subscription.trial_end ? formatDate(subscription.trial_end) : ""}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ 
                      width: `${((14 - getTrialDaysRemaining()) / 14) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                After trial, you'll be downgraded to Free unless you upgrade
              </p>

              <Button onClick={() => setShowUpgradeModal(true)} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade Now
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Usage Stats (if Pro or Trial) */}
      {(isPro || isTrialing) && usage && (
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Current Usage</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-2xl font-bold">{usage.team_count}</p>
              <p className="text-sm text-muted-foreground">Teams</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{usage.project_count}</p>
              <p className="text-sm text-muted-foreground">Projects</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{usage.task_count}</p>
              <p className="text-sm text-muted-foreground">Tasks</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{usage.time_entry_count_month}</p>
              <p className="text-sm text-muted-foreground">Time Entries (this month)</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">No limits on Pro plan</p>
        </Card>
      )}

      {/* Invoices (if Pro) */}
      {isPro && invoices.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Invoices</h2>
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="flex items-center justify-between py-3 border-b last:border-0">
                <div>
                  <p className="font-medium">{formatDate(invoice.created_at)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatCurrency(invoice.amount_paid, invoice.currency)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={invoice.status === "paid" ? "default" : "secondary"}>
                    {invoice.status}
                  </Badge>
                  {invoice.invoice_pdf && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(invoice.invoice_pdf!, "_blank")}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      PDF
                    </Button>
                  )}
                  {invoice.hosted_invoice_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(invoice.hosted_invoice_url!, "_blank")}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Modals */}
      {showUpgradeModal && (
        <UpgradeToPro
          open={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          organizationId={currentOrg?.id}
          hasTrialed={!!subscription?.trial_start}
        />
      )}

      {showCancelModal && (
        <CancelSubscription
          open={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          subscription={subscription}
          usage={usage}
          onSuccess={loadBillingData}
        />
      )}
      </div>
    </PageLayout>
  );
}
