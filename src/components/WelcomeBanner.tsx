import { useState } from "react";
import { X, Shield } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useBranding } from "@/hooks/useBranding";
import { Button } from "@/components/ui/button";

export function WelcomeBanner() {
  const { isAdmin } = useAuth();
  const { org_name } = useAppSettings();
  const branding = useBranding();
  const [dismissed, setDismissed] = useState(() => {
    return sessionStorage.getItem("welcome-banner-dismissed") === "true";
  });

  if (isAdmin || dismissed) return null;

  return (
    <div className="relative flex items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 mb-3">
      {branding.dashboard_logo_url ? (
        <img
          src={branding.dashboard_logo_url}
          alt={branding.company_name}
          loading="lazy"
          decoding="async"
          className="h-6 w-6 shrink-0 rounded object-contain"
        />
      ) : (
        <Shield className="h-5 w-5 shrink-0 text-primary" />
      )}
      <p className="min-w-0 flex-1 text-sm font-medium text-foreground">
        Welcome to {org_name}: {branding.system_label}
      </p>
      <Button variant="ghost" size="icon"
        onClick={() => {
          setDismissed(true);
          sessionStorage.setItem("welcome-banner-dismissed", "true");
        }}
        className="h-8 w-8 shrink-0 text-muted-foreground"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
