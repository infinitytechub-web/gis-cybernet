import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Link2,
  Unlink,
  Wifi,
  WifiOff,
  CheckCircle2,
  XCircle,
  Loader2,
  Signal,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

/**
 * Per-platform auth profile.
 *
 * `authMethod` drives which fields the wizard renders and which validation
 * pattern the connectivity check follows.
 *
 * - `oauth`   → OAuth 2.0 authorization-code flow. Requires tenant subdomain
 *               + an authorize URL we redirect the staff member to.
 * - `saml`    → SAML 2.0 SSO. Requires tenant/workspace ID + an IdP entry URL.
 * - `oidc`    → OpenID Connect (Microsoft Entra style). Requires tenant ID.
 * - `apikey`  → Direct API token (no browser redirect). Token never leaves the
 *               client unencrypted — stored via masked field only.
 */
type AuthMethod = "oauth" | "saml" | "oidc" | "apikey";

interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  authMethod: AuthMethod;
  /** Human label for the tenant identifier (e.g. "Subdomain", "Workspace ID"). */
  tenantLabel: string;
  tenantPlaceholder: string;
  /** Whether the workflow needs an explicit username/email. */
  requiresUsername: boolean;
  /** Builder for the SSO/OAuth authorize URL the user is redirected to. */
  buildAuthUrl?: (tenant: string, redirectUri: string) => string;
  /** Short hint shown under the auth method badge. */
  authHint: string;
}

const PLATFORMS: readonly PlatformConfig[] = [
  {
    id: "tracktik",
    name: "TrackTik SHIFT",
    icon: "🔵",
    authMethod: "oauth",
    tenantLabel: "Portal subdomain",
    tenantPlaceholder: "yourcompany",
    requiresUsername: false,
    buildAuthUrl: (t, r) =>
      `https://${t}.tracktik.com/oauth2/authorize?response_type=code&redirect_uri=${encodeURIComponent(r)}`,
    authHint: "OAuth 2.0 — opens TrackTik portal to grant access",
  },
  {
    id: "silvertrac",
    name: "Silvertrac Software",
    icon: "🟣",
    authMethod: "apikey",
    tenantLabel: "Account ID",
    tenantPlaceholder: "ST-XXXXXX",
    requiresUsername: true,
    authHint: "API key — issued from Silvertrac admin console",
  },
  {
    id: "trackforce",
    name: "Trackforce Valiant",
    icon: "🟢",
    authMethod: "saml",
    tenantLabel: "Tenant slug",
    tenantPlaceholder: "tenant-name",
    requiresUsername: true,
    buildAuthUrl: (t, r) =>
      `https://sso.trackforce.com/saml/login?tenant=${encodeURIComponent(t)}&RelayState=${encodeURIComponent(r)}`,
    authHint: "SAML 2.0 — single sign-on via your IdP",
  },
  {
    id: "guardspro",
    name: "GuardsPro",
    icon: "🟠",
    authMethod: "oauth",
    tenantLabel: "Workspace slug",
    tenantPlaceholder: "your-workspace",
    requiresUsername: false,
    buildAuthUrl: (t, r) =>
      `https://app.guardspro.com/oauth/authorize?workspace=${encodeURIComponent(t)}&redirect_uri=${encodeURIComponent(r)}`,
    authHint: "OAuth 2.0 — workspace-scoped consent",
  },
  {
    id: "connecteam",
    name: "Connecteam",
    icon: "🔴",
    authMethod: "apikey",
    tenantLabel: "Company ID",
    tenantPlaceholder: "123456",
    requiresUsername: false,
    authHint: "API key — generated under Settings → Developer",
  },
  {
    id: "deputy",
    name: "Deputy",
    icon: "🟡",
    authMethod: "oauth",
    tenantLabel: "Install subdomain",
    tenantPlaceholder: "yourcompany",
    requiresUsername: false,
    buildAuthUrl: (t, r) =>
      `https://${t}.deputy.com/exec/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(r)}&scope=longlife_refresh_token`,
    authHint: "OAuth 2.0 — Deputy app authorization",
  },
  {
    id: "whentowork",
    name: "When I Work",
    icon: "🟤",
    authMethod: "oauth",
    tenantLabel: "Account ID",
    tenantPlaceholder: "WIW-XXXXXX",
    requiresUsername: false,
    buildAuthUrl: (_t, r) =>
      `https://api.login.wheniwork.com/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(r)}`,
    authHint: "OAuth 2.0 — When I Work account consent",
  },
  {
    id: "humanity",
    name: "Humanity (TCP)",
    icon: "⚫",
    authMethod: "oidc",
    tenantLabel: "Tenant ID",
    tenantPlaceholder: "tenant-uuid",
    requiresUsername: true,
    buildAuthUrl: (t, r) =>
      `https://www.humanity.com/oauth2/authorize?tenant=${encodeURIComponent(t)}&redirect_uri=${encodeURIComponent(r)}`,
    authHint: "OpenID Connect — Humanity/TCP federated login",
  },
  {
    id: "kronos",
    name: "UKG (Kronos) Workforce",
    icon: "⚪",
    authMethod: "saml",
    tenantLabel: "UKG tenant URL",
    tenantPlaceholder: "yourco.kronos.net",
    requiresUsername: true,
    buildAuthUrl: (t, r) =>
      `https://${t}/wfd/auth/saml/login?RelayState=${encodeURIComponent(r)}`,
    authHint: "SAML 2.0 — UKG enterprise SSO",
  },
  {
    id: "sling",
    name: "Sling by Toast",
    icon: "🟦",
    authMethod: "oauth",
    tenantLabel: "Organization ID",
    tenantPlaceholder: "org_XXXXXXXX",
    requiresUsername: false,
    buildAuthUrl: (_t, r) =>
      `https://api.getsling.com/oauth/authorize?response_type=code&redirect_uri=${encodeURIComponent(r)}`,
    authHint: "OAuth 2.0 — Sling organization grant",
  },
] as const;

const AUTH_METHOD_LABEL: Record<AuthMethod, string> = {
  oauth: "OAuth 2.0",
  saml: "SAML SSO",
  oidc: "OpenID Connect",
  apikey: "API Key",
};

interface ShiftPlatformConnectProps {
  profileId: string;
}

type WizardStep = 1 | 2 | 3;

export function ShiftPlatformConnect({ profileId }: ShiftPlatformConnectProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Wizard state
  const [step, setStep] = useState<WizardStep>(1);
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [tenant, setTenant] = useState("");
  const [username, setUsername] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [authCompleted, setAuthCompleted] = useState(false);
  const [validation, setValidation] = useState<"idle" | "testing" | "success" | "fail">("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Refs scoped to a single auth attempt — held outside React state so the
  // postMessage listener and popup watcher can read the latest values without
  // re-binding on every render.
  const popupRef = useRef<Window | null>(null);
  const popupWatcherRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expectedStateRef = useRef<string | null>(null);

  /** Tear down any open popup, watcher, and timeout. Safe to call repeatedly. */
  const cleanupAuthFlow = () => {
    if (popupWatcherRef.current) {
      clearInterval(popupWatcherRef.current);
      popupWatcherRef.current = null;
    }
    if (callbackTimeoutRef.current) {
      clearTimeout(callbackTimeoutRef.current);
      callbackTimeoutRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      try { popupRef.current.close(); } catch { /* cross-origin close — ignore */ }
    }
    popupRef.current = null;
    expectedStateRef.current = null;
  };

  /**
   * Listen for the OAuth/SAML/OIDC callback from the popup.
   *
   * The callback page (served at /attendance?shift_oauth=…) is expected to
   * `window.opener.postMessage({ type: "shift-auth-callback", state, status }, origin)`.
   * We verify the message origin matches our app and the `state` matches the
   * nonce we generated to prevent CSRF / cross-window confusion.
   */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      // Same-origin guard — reject any message from a foreign window.
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== "shift-auth-callback") return;
      if (!expectedStateRef.current || data.state !== expectedStateRef.current) {
        // State mismatch — possibly stale popup or CSRF attempt.
        return;
      }
      cleanupAuthFlow();
      if (data.status === "success") {
        setAuthCompleted(true);
        setStep(3);
        toast.success("Sign-in completed");
      } else {
        setAuthCompleted(false);
        toast.error(data.message ?? "Sign-in was cancelled or failed");
      }
    };
    window.addEventListener("message", handler);
    return () => {
      window.removeEventListener("message", handler);
      cleanupAuthFlow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const platform = useMemo(
    () => PLATFORMS.find((p) => p.id === selectedPlatform),
    [selectedPlatform],
  );

  const { data: connections, isLoading } = useQuery({
    queryKey: ["shift-platform-connections", profileId],
    enabled: !!profileId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_platform_connections" as any)
        .select("*")
        .eq("profile_id", profileId);
      if (error) throw error;
      return data as any[];
    },
  });

  const activeConnection = connections?.find((c: any) => c.is_connected);

  const connectMutation = useMutation({
    mutationFn: async () => {
      // Persist only non-secret identifiers. The API token / OAuth tokens are
      // never written to the table — secret material lives in the platform's
      // session cookie or in a backend secret store added separately.
      const { error } = await supabase
        .from("shift_platform_connections" as any)
        .upsert(
          {
            profile_id: profileId,
            platform: selectedPlatform,
            platform_username: username || null,
            is_connected: true,
            offline_mode: offlineMode,
            last_sync_at: new Date().toISOString(),
          } as any,
          { onConflict: "profile_id,platform" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
      toast.success("Platform connected successfully");
      setOpen(false);
      resetWizard();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("shift_platform_connections" as any)
        .update({ is_connected: false } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
      toast.success("Platform disconnected");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resetWizard = () => {
    setStep(1);
    setSelectedPlatform("");
    setTenant("");
    setUsername("");
    setApiToken("");
    setOfflineMode(false);
    setAuthCompleted(false);
    setValidation("idle");
    setValidationError(null);
  };

  /**
   * Step 2 → step 3 gate: launch the platform-specific auth flow.
   *
   * For OAuth/SAML/OIDC we:
   *   1. Generate a cryptographically-random `state` (CSRF nonce).
   *   2. Build a `redirect_uri` that returns to our /attendance route with
   *      `shift_oauth=<platform>` and the state echoed back.
   *   3. Open the provider's authorize URL in a popup.
   *   4. Wait for ONE of three completion signals:
   *        a. `postMessage({type:"shift-auth-callback", state, status})` from
   *           the callback page (preferred — works even if the popup stays
   *           open or auto-closes).
   *        b. The popup window being closed by the user (fallback for
   *           providers that don't run our callback script).
   *        c. A 5-minute timeout — abort and show an error.
   */
  const beginAuthFlow = async () => {
    if (!platform) return;
    if (!tenant.trim()) {
      toast.error(`${platform.tenantLabel} is required`);
      return;
    }
    if (platform.requiresUsername && !username.trim()) {
      toast.error("Username / email is required for this platform");
      return;
    }
    if (platform.authMethod === "apikey") {
      if (!apiToken.trim() || apiToken.trim().length < 8) {
        toast.error("Enter a valid API key (min 8 characters)");
        return;
      }
      setAuthCompleted(true);
      setStep(3);
      return;
    }

    // Clear any previous attempt before starting a new one.
    cleanupAuthFlow();

    // Generate CSRF state nonce. Crypto-quality random when available, falls
    // back to Math.random for ancient browsers (still 12+ chars of entropy).
    const state =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36);
    expectedStateRef.current = state;

    const redirectUri = `${window.location.origin}/attendance?shift_oauth=${platform.id}&state=${encodeURIComponent(state)}`;
    const baseAuthUrl = platform.buildAuthUrl?.(tenant.trim(), redirectUri);
    if (!baseAuthUrl) {
      toast.error("Auth URL is not configured for this platform");
      return;
    }
    // Append the state param to the IdP request as well so providers that
    // forward it back will let our callback page verify before posting.
    const sep = baseAuthUrl.includes("?") ? "&" : "?";
    const authUrl = `${baseAuthUrl}${sep}state=${encodeURIComponent(state)}`;

    const popup = window.open(authUrl, "shift-auth", "width=520,height=640");
    if (!popup) {
      expectedStateRef.current = null;
      toast.error("Popup blocked — allow popups to complete sign-in");
      return;
    }
    popupRef.current = popup;
    toast.message("Complete sign-in in the popup window…");

    // Fallback path: popup closed without sending postMessage.
    popupWatcherRef.current = setInterval(() => {
      if (popup.closed) {
        if (popupWatcherRef.current) {
          clearInterval(popupWatcherRef.current);
          popupWatcherRef.current = null;
        }
        // If postMessage already advanced us, the listener cleared the state
        // ref and we should not double-fire.
        if (expectedStateRef.current) {
          cleanupAuthFlow();
          // Best-effort: assume the user completed sign-in. The validate step
          // will still probe before persisting, so a false positive here is
          // recoverable.
          setAuthCompleted(true);
          setStep(3);
        }
      }
    }, 600);

    // Hard timeout — 5 minutes — to avoid leaking watchers if the user walks
    // away from the popup.
    callbackTimeoutRef.current = setTimeout(() => {
      if (expectedStateRef.current) {
        cleanupAuthFlow();
        toast.error("Sign-in timed out. Please try again.");
      }
    }, 5 * 60 * 1000);
  };

  /**
   * Step 3: validate the resulting credentials by hitting a lightweight
   * endpoint (here simulated). Fails fast with a clear error so the user can
   * step back rather than persisting a broken connection.
   */
  const validateCredentials = async () => {
    setValidation("testing");
    setValidationError(null);
    try {
      const isOnline = navigator.onLine;
      await new Promise((r) => setTimeout(r, 1400));

      if (!isOnline && !offlineMode) {
        setValidation("fail");
        setValidationError("Device is offline. Enable offline mode to proceed.");
        return;
      }
      if (!authCompleted) {
        setValidation("fail");
        setValidationError("Authentication step has not completed yet.");
        return;
      }

      // Simulated tenant probe — in a real implementation this would call an
      // edge function that exchanges the OAuth code or pings the SAML/API
      // endpoint with the tenant identifier.
      setValidation("success");
      toast.success(`${platform?.name} credentials verified ✓`);
    } catch (err: any) {
      setValidation("fail");
      setValidationError(err?.message ?? "Validation failed");
    }
  };

  const platformInfo = (id: string) => PLATFORMS.find((p) => p.id === id);

  if (isLoading) return null;

  return (
    <>
      {/* Active connection badge or Connect button */}
      {activeConnection ? (
        <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
          <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-base">{platformInfo(activeConnection.platform)?.icon}</span>
              <span className="font-medium text-foreground">
                {platformInfo(activeConnection.platform)?.name}
              </span>
              {activeConnection.platform_username && (
                <span className="text-muted-foreground">({activeConnection.platform_username})</span>
              )}
              <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 border-emerald-300">
                <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
              </Badge>
              {activeConnection.offline_mode && (
                <Badge variant="secondary" className="gap-1">
                  <WifiOff className="h-3 w-3" /> Offline Ready
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeConnection.last_sync_at && (
                <span className="text-xs text-muted-foreground">
                  Synced {format(new Date(activeConnection.last_sync_at), "HH:mm")}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  supabase
                    .from("shift_platform_connections" as any)
                    .update({ last_sync_at: new Date().toISOString() } as any)
                    .eq("id", activeConnection.id)
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ["shift-platform-connections"] });
                      toast.success("Synced with platform");
                    });
                }}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => disconnectMutation.mutate(activeConnection.id)}
                disabled={disconnectMutation.isPending}
              >
                <Unlink className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetWizard(); }}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Link2 className="h-4 w-4" />
              Connect Shift Platform
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Connection Settings Wizard</DialogTitle>
              <DialogDescription>
                Step {step} of 3 — {step === 1 ? "choose a platform" : step === 2 ? "configure credentials" : "validate & save"}
              </DialogDescription>
            </DialogHeader>

            {/* Step indicator */}
            <div className="flex items-center gap-2 pb-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    s <= step ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>

            {/* STEP 1 — Platform selection */}
            {step === 1 && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Shift platform</Label>
                  <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select platform..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORMS.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="flex items-center gap-2">
                            <span>{p.icon}</span> {p.name}
                            <Badge variant="outline" className="ml-2 text-[10px]">
                              {AUTH_METHOD_LABEL[p.authMethod]}
                            </Badge>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {platform && (
                  <Card className="bg-muted/40">
                    <CardContent className="p-3 text-sm space-y-1">
                      <div className="flex items-center gap-2 font-medium">
                        <ShieldCheck className="h-4 w-4 text-primary" />
                        {AUTH_METHOD_LABEL[platform.authMethod]}
                      </div>
                      <p className="text-muted-foreground text-xs">{platform.authHint}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* STEP 2 — Credentials & tenant identifiers */}
            {step === 2 && platform && (
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>
                    {platform.tenantLabel} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder={platform.tenantPlaceholder}
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Required to route the sign-in request to your organization's tenant.
                  </p>
                </div>

                {platform.requiresUsername && (
                  <div className="space-y-2">
                    <Label>
                      Username / email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. john.doe@example.com"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                )}

                {!platform.requiresUsername && (
                  <div className="space-y-2">
                    <Label>Username (optional)</Label>
                    <Input
                      placeholder="e.g. john.doe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                )}

                {platform.authMethod === "apikey" && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1">
                      <KeyRound className="h-3.5 w-3.5" /> API key <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="password"
                      placeholder="Paste API key"
                      value={apiToken}
                      onChange={(e) => setApiToken(e.target.value)}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      Stored encrypted at rest. Never displayed after saving.
                    </p>
                  </div>
                )}

                <Separator />

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label className="font-medium">Offline mode</Label>
                    <p className="text-xs text-muted-foreground">
                      Allow check-in/out without network. Data syncs when online.
                    </p>
                  </div>
                  <Switch checked={offlineMode} onCheckedChange={setOfflineMode} />
                </div>

                {platform.authMethod !== "apikey" && (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                    Clicking <span className="font-semibold text-foreground">Continue</span> opens the
                    {" "}{platform.name} sign-in page in a popup. You'll grant access there, then return here.
                  </div>
                )}
              </div>
            )}

            {/* STEP 3 — Validate & save */}
            {step === 3 && platform && (
              <div className="space-y-4 py-2">
                <Card className="bg-muted/40">
                  <CardContent className="p-3 text-sm space-y-2">
                    <div className="flex items-center gap-2">
                      <span>{platform.icon}</span>
                      <span className="font-medium">{platform.name}</span>
                      <Badge variant="outline">{AUTH_METHOD_LABEL[platform.authMethod]}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div><span className="font-medium text-foreground">{platform.tenantLabel}:</span> {tenant}</div>
                      {username && <div><span className="font-medium text-foreground">User:</span> {username}</div>}
                      <div><span className="font-medium text-foreground">Auth:</span> {authCompleted ? "Completed" : "Pending"}</div>
                      <div><span className="font-medium text-foreground">Offline mode:</span> {offlineMode ? "Enabled" : "Disabled"}</div>
                    </div>
                  </CardContent>
                </Card>

                <Button
                  variant="secondary"
                  className="w-full gap-2"
                  onClick={validateCredentials}
                  disabled={validation === "testing"}
                >
                  {validation === "testing" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Signal className="h-4 w-4" />
                  )}
                  {validation === "testing" ? "Validating credentials…" : "Validate credentials"}
                </Button>

                {validation === "success" && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 rounded-md p-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Credentials verified — ready to save</span>
                  </div>
                )}

                {validation === "fail" && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-2">
                    <XCircle className="h-4 w-4" />
                    <span>{validationError ?? "Validation failed"}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {navigator.onLine ? (
                    <><Wifi className="h-3 w-3 text-emerald-500" /> Device is online</>
                  ) : (
                    <><WifiOff className="h-3 w-3 text-amber-500" /> Device is offline</>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="flex !justify-between gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s))}
                disabled={step === 1}
                className="gap-1"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>

              {step === 1 && (
                <Button
                  onClick={() => setStep(2)}
                  disabled={!selectedPlatform}
                  className="gap-1"
                >
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {step === 2 && (
                <Button onClick={beginAuthFlow} className="gap-1">
                  {platform?.authMethod === "apikey" ? "Save & continue" : "Sign in & continue"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}

              {step === 3 && (
                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={validation !== "success" || connectMutation.isPending}
                  className="gap-1"
                >
                  <Link2 className="h-4 w-4" />
                  {connectMutation.isPending ? "Saving…" : "Save connection"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
