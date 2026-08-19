import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { BrandingSettings } from "@/components/settings/BrandingSettings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Palette, ArrowLeft, ShieldCheck } from "lucide-react";

/**
 * Dedicated admin Branding Settings module.
 * Identity, logos, theme colours, login screen, contacts/footer and email branding.
 */
export default function Branding() {
  const { isAdmin } = useAuth();

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 p-2">
              <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <h1 className="truncate text-xl font-bold text-secondary sm:text-2xl">Branding Settings</h1>
            <Badge variant="outline" className="hidden sm:inline-flex gap-1">
              <ShieldCheck className="h-3 w-3" /> {isAdmin ? "Administrator" : "Read-only"}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Customize system identity, logos, theme colours, login screen, organization details, footer and email branding.
            Names, colours and logos apply immediately; email branding applies to newly sent messages.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Link to="/admin-console"><ArrowLeft className="h-4 w-4" /> Admin Console</Link>
        </Button>
      </header>

      <BrandingSettings />
    </div>
  );
}
