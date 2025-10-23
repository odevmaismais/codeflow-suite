import { useEffect, useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";

interface Props {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        // 1) Ensure we have a session
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData?.session || null;

        if (!session) {
          navigate("/auth", { replace: true, state: { from: location.pathname } });
          return;
        }

        // 2) Verify user still exists (handles deleted accounts)
        const { data: userData, error } = await supabase.auth.getUser();
        if (error || !userData?.user) {
          await supabase.auth.signOut();
          navigate("/auth", { replace: true });
          return;
        }
      } finally {
        if (mounted) setChecking(false);
      }
    };

    // Subscribe to auth changes to react immediately
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth", { replace: true });
      }
    });

    init();

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [navigate, location.pathname]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
