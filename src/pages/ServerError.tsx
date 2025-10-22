import { Button } from '@/components/ui/button';
import { ServerCrash } from 'lucide-react';

const ServerError = () => {
  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted">
      <div className="text-center px-4">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-destructive/10 mb-6">
          <ServerCrash className="h-12 w-12 text-destructive" />
        </div>
        <h1 className="text-4xl font-bold mb-4">Something Went Wrong</h1>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          We're working to fix the issue. Please try again later.
        </p>
        <Button onClick={handleReload} size="lg">
          Reload Page
        </Button>
      </div>
    </div>
  );
};

export default ServerError;
