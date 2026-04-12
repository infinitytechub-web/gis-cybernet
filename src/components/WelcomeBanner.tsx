import { useState } from "react";
import { X, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";

export function WelcomeBanner() {
  const { isAdmin } = useAuth();
  const { org_name, system_label } = useAppSettings();
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem("welcome-banner-dismissed") === "true";
  });

  if (isAdmin || dismissed) return null;

  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-4">
      <Shield className="h-5 w-5 shrink-0 text-primary" />
      <p className="text-sm font-medium text-foreground">
        Welcome to {org_name}: {system_label}
      </p>
      <button
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem("welcome-banner-dismissed", "true");
        }}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
