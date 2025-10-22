import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UpgradeToProProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  hasTrialed: boolean;
}

export function UpgradeToPro({ open, onClose, organizationId, hasTrialed }: UpgradeToProProps) {
  const [loading, setLoading] = useState(false);

  const handleStartTrial = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase.rpc("start_trial", {
        p_org_id: organizationId,
      });

      if (error) throw error;

      if (!data) {
        toast.error("Trial already used for this organization");
        return;
      }

      toast.success("Trial started! You have 14 days to explore Pro features.");
      onClose();
      window.location.reload();
    } catch (error: any) {
      console.error("Error starting trial:", error);
      toast.error("Failed to start trial");
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please log in to upgrade");
        return;
      }

      const { data, error } = await supabase.functions.invoke("create-checkout-session", {
        body: {
          organization_id: organizationId,
          user_email: user.email,
          success_url: `${window.location.origin}/settings/billing?success=true`,
          cancel_url: `${window.location.origin}/settings/billing?canceled=true`,
        },
      });

      if (error) {
        console.error("Checkout error:", error);
        toast.error("Failed to start checkout");
        return;
      }

      if (data?.url) {
        // Open checkout in new tab to avoid page loading issues
        const checkoutWindow = window.open(data.url, '_blank');
        if (!checkoutWindow) {
          toast.error("Please allow pop-ups to complete checkout");
        } else {
          toast.success("Opening Stripe Checkout...");
          onClose();
        }
      } else {
        toast.error("No checkout URL returned");
      }
    } catch (error: any) {
      console.error("Error creating checkout:", error);
      toast.error("Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Upgrade to Pro Plan</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Trial Banner */}
          {!hasTrialed && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-4 rounded-lg border border-primary/20">
              <p className="font-semibold mb-1">🎉 Start your 14-day free trial today!</p>
              <p className="text-sm text-muted-foreground mb-2">
                No credit card required for trial • Cancel anytime
              </p>
            </div>
          )}

          {/* Plan Comparison */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Free Plan */}
            <div className="border rounded-lg p-6">
              <div className="mb-4">
                <h3 className="text-xl font-bold mb-1">Free</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$0</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm">1 team</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm">3 projects</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm">50 tasks per project</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm">100 time entries/month</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm">Basic support</span>
                </div>
              </div>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-primary rounded-lg p-6 relative bg-primary/5">
              <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                Most Popular
              </Badge>

              <div className="mb-4">
                <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Pro
                </h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">$29</span>
                  <span className="text-muted-foreground">/month</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium">Unlimited teams</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium">Unlimited projects</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium">Unlimited tasks</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium">Unlimited time entries</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium">Priority support</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <span className="text-sm font-medium">Advanced analytics (coming soon)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            {!hasTrialed ? (
              <Button onClick={handleStartTrial} disabled={loading} size="lg">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Start Free Trial
              </Button>
            ) : (
              <Button onClick={handleUpgrade} disabled={loading} size="lg">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
