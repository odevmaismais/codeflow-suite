import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";
import { UpgradeToPro } from "./UpgradeToPro";

interface SubscriptionCardProps {
  organizationId: string;
  onUpdate?: () => void;
}

export function SubscriptionCard({ organizationId, onUpdate }: SubscriptionCardProps) {
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    loadSubscription();
  }, [organizationId]);

  const loadSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("organization_id", organizationId)
        .single();

      if (error) throw error;
      setSubscription(data);
    } catch (error) {
      console.error("Error loading subscription:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setShowUpgradeModal(false);
    loadSubscription();
    onUpdate?.();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const isFree = subscription?.plan === "free";
  const isPro = subscription?.plan === "pro";
  const isTrialing = subscription?.status === "trialing";

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Your current plan and billing information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                {isFree && !isTrialing && (
                  <>
                    <p className="font-medium">Free Plan</p>
                    <p className="text-sm text-muted-foreground">1 user • 1 team • 3 projects</p>
                  </>
                )}
                {(isPro || isTrialing) && (
                  <>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Pro Plan</p>
                      {isTrialing && <Badge variant="secondary">Trial</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">Unlimited teams • projects • tasks</p>
                  </>
                )}
              </div>
              <Badge variant={isTrialing ? "secondary" : "default"}>
                {isTrialing ? "Trialing" : "Active"}
              </Badge>
            </div>
            {isFree && !isTrialing && (
              <Button onClick={() => setShowUpgradeModal(true)} className="w-full">
                <Sparkles className="h-4 w-4 mr-2" />
                Upgrade to Pro
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {showUpgradeModal && (
        <UpgradeToPro
          open={showUpgradeModal}
          onClose={handleModalClose}
          organizationId={organizationId}
          hasTrialed={!!subscription?.trial_start}
        />
      )}
    </>
  );
}
