import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">404</h1>
        <p className="text-sm text-muted-foreground">Page not found.</p>
        <Button onClick={() => navigate("/")} variant="outline">Go to Generator</Button>
      </div>
    </div>
  );
}
