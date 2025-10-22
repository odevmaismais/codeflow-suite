import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ShieldX } from 'lucide-react';

const AccessDenied = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
      <div className="text-center px-4">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-destructive/10 mb-6">
          <ShieldX className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-4xl font-bold mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          You don't have permission to view this page. Please contact your administrator.
        </p>
        <Button onClick={() => navigate('/dashboard')} size="lg">
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
};

export default AccessDenied;
