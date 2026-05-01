import { useState, type ReactNode } from "react";
import { AlertTriangle, ExternalLink, ShieldAlert, Loader2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { scanUrl, recordFirewallEvent, type FirewallVerdict } from "@/lib/firewall";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SafeLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  /** Show the small external-link icon next to the text. Default: true. */
  showIcon?: boolean;
}

/**
 * Anchor that runs the URL through the firewall *before* navigating.
 * - allow → open in new tab
 * - warn  → confirm interstitial
 * - quarantine → block + offer to send to admin queue
 * - block → refuse outright
 */
export function SafeLink({ href, children, className, showIcon = true }: SafeLinkProps) {
  const [verdict, setVerdict] = useState<FirewallVerdict | null>(null);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setChecking(true);
    try {
      const v = await scanUrl(href);
      setVerdict(v);
      if (v.action === "allow") {
        await recordFirewallEvent({ layer: "url", action: "allow", subject: href });
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }
      setOpen(true);
      await recordFirewallEvent({
        layer: "url",
        action: v.action,
        subject: href,
        details: { reason: v.reason },
        matched_rule_id: v.matched_rule_id,
        matched_threat_id: v.matched_threat_id,
      });
    } catch (err) {
      toast.error("Could not check link safety");
    } finally {
      setChecking(false);
    }
  };

  const proceed = () => {
    setOpen(false);
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const isBlocked = verdict?.action === "block";
  const isQuarantined = verdict?.action === "quarantine";

  return (
    <>
      <a
        href={href}
        onClick={handleClick}
        className={cn(
          "inline-flex items-center gap-1 text-primary hover:underline break-all",
          className,
        )}
        aria-busy={checking}
      >
        {children}
        {checking ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : showIcon ? (
          <ExternalLink className="h-3 w-3 opacity-70" />
        ) : null}
      </a>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {isBlocked ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
              {isBlocked
                ? "Link blocked by firewall"
                : isQuarantined
                  ? "Link sent for admin review"
                  : "Open external link?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs">{href}</span>
              <span className="block text-sm">
                <strong>Reason:</strong> {verdict?.reason ?? "—"}
              </span>
              {!isBlocked && !isQuarantined && (
                <span className="block text-xs text-muted-foreground">
                  This link leaves the Cybernet portal. Continue only if you trust the destination.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {isBlocked || isQuarantined ? (
              <AlertDialogAction>Acknowledge</AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button onClick={proceed}>Continue to site</Button>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
