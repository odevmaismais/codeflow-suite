import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CancelSubscriptionProps {
  open: boolean;
  onClose: () => void;
  subscription: any;
  usage: any;
  onSuccess: () => void;
}

export function CancelSubscription({
  open,
  onClose,
  subscription,
  usage,
  onSuccess,
}: CancelSubscriptionProps) {
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleCancel = async () => {
    if (!confirmed) {
      toast.error("Please confirm you understand the changes");
      return;
    }

    try {
      setLoading(true);

      // Cancel subscription via Stripe
      const { data, error } = await supabase.functions.invoke("cancel-subscription", {
        body: {
          subscription_id: subscription.stripe_subscription_id,
        },
      });

      if (error) throw error;

      toast.success("Subscription canceled. You'll remain on Pro until " + 
        formatDate(subscription.current_period_end));
      
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error canceling subscription:", error);
      toast.error("Failed to cancel subscription");
    } finally {
      setLoading(false);
    }
  };

  const hasExcessResources = usage && (
    usage.team_count > 1 || 
    usage.project_count > 3
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancel Subscription
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-destructive/10 p-4 rounded-lg border border-destructive/20">
            <p className="font-medium mb-2">Are you sure you want to cancel your Pro subscription?</p>
            <p className="text-sm text-muted-foreground mb-2">
              You'll lose access to Pro features at the end of your billing period (
              {subscription.current_period_end && formatDate(subscription.current_period_end)}).
            </p>
            <p className="text-sm text-muted-foreground">
              Your data will be preserved, but you'll be downgraded to Free plan limits.
            </p>
          </div>

          {/* Impact Summary */}
          <div className="space-y-2">
            <p className="font-medium">After downgrade, you'll have:</p>
            <ul className="space-y-1 text-sm text-muted-foreground ml-4">
              <li>• 1 team {usage?.team_count > 1 && `(you currently have ${usage.team_count})`}</li>
              <li>• 3 projects {usage?.project_count > 3 && `(you currently have ${usage.project_count})`}</li>
              <li>• 50 tasks per project</li>
              <li>• 100 time entries per month</li>
            </ul>
          </div>

          {hasExcessResources && (
            <div className="bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-900">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-2">
                ⚠️ You have resources exceeding Free plan limits
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Please archive or delete excess resources before your subscription ends to avoid data access issues.
              </p>
            </div>
          )}

          {/* Confirmation Checkbox */}
          <div className="flex items-start gap-2 pt-2">
            <Checkbox
              id="confirm"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked as boolean)}
            />
            <label
              htmlFor="confirm"
              className="text-sm cursor-pointer leading-tight"
            >
              I understand I'll be downgraded to Free plan and will lose access to Pro features
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Keep Pro Plan
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={!confirmed || loading}
            >
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cancel Subscription
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
