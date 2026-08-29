import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, ShieldAlert, KeyRound, Clock, Loader2, Save, Info, Bot } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { logSecurityEvent } from "@/lib/security-audit";

/** Roles that can be placed under a mandatory-MFA requirement. */
const MFA_ROLE_CHOICES: { value: string; label: string }[] = [
  { value: "admin", label: "System Administrator" },
  { value: "oic", label: "Officer in Charge (OIC)" },
  { value: "2ic", label: "Second in Command (2IC)" },
  { value: "staff_officer", label: "Staff Officer" },
  { value: "supervisor", label: "Supervisor" },
  { value: "command_officer", label: "Command Officer" },
  { value: "shift_leader", label: "Shift Leader" },
  { value: "front_desk", label: "Front Desk" },
  { value: "storekeeper", label: "Storekeeper" },
  { value: "procurement_officer", label: "Procurement Officer" },
  { value: "medical_officer", label: "Medical Officer" },
  { value: "staff", label: "Staff" },
];

interface PolicyRow {
  id: string;
  // lockout
  lockout_threshold: number;
  lockout_window_minutes: number;
  lockout_auto_unlock_minutes: number | null;
  // password
  min_password_length: number;
  enforce_password_change: boolean;
  password_require_upper: boolean;
  password_require_lower: boolean;
  password_require_number: boolean;
  password_require_symbol: boolean;
  password_min_strength: number;
  // sessions
  auto_logout_minutes: number;
  auto_logout_warning_seconds: number;
  session_absolute_hours: number;
  max_concurrent_sessions: number;
  // mfa
  mfa_required_roles: string[] | null;
  mfa_grace_days: number;
  // bot protection
  recaptcha_enabled: boolean;
  recaptcha_site_key: string | null;
  recaptcha_min_score: number;
}

const FIELD_LABELS: Record<string, string> = {
  lockout_threshold: "Failed-attempt threshold",
  lockout_window_minutes: "Lockout counting window (minutes)",
  lockout_auto_unlock_minutes: "Automatic unlock after (minutes)",
  min_password_length: "Minimum password length",
  enforce_password_change: "Force password change on first login",
  password_require_upper: "Require uppercase letter",
  password_require_lower: "Require lowercase letter",
  password_require_number: "Require number",
  password_require_symbol: "Require symbol",
  password_min_strength: "Minimum password strength",
  auto_logout_minutes: "Idle timeout (minutes)",
  auto_logout_warning_seconds: "Idle warning lead time (seconds)",
  session_absolute_hours: "Maximum session length (hours)",
  max_concurrent_sessions: "Maximum simultaneous devices",
  mfa_required_roles: "Roles requiring MFA",
  mfa_grace_days: "MFA enrolment grace period (days)",
  recaptcha_enabled: "Bot protection (reCAPTCHA v3)",
  recaptcha_site_key: "reCAPTCHA site key",
  recaptcha_min_score: "reCAPTCHA minimum score",
};

export function AccessPolicySettings() {
  const queryClient = useQueryClient();

  const { data: row, isLoading } = useQuery({
    queryKey: ["access-policy"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (error) throw error;
      return data as unknown as PolicyRow;
    },
  });

  const [form, setForm] = useState<Partial<PolicyRow>>({});
  const set = <K extends keyof PolicyRow>(key: K, value: PolicyRow[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (row) setForm(row);
  }, [row]);

  const v = <K extends keyof PolicyRow>(key: K): PolicyRow[K] =>
    (form[key] ?? (row?.[key] as PolicyRow[K])) as PolicyRow[K];

  const requiredRoles: string[] = (v("mfa_required_roles") as string[] | null) ?? [];
  const autoUnlock = v("lockout_auto_unlock_minutes");

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row?.id) throw new Error("No settings row found");

      const next: Partial<PolicyRow> = {
        lockout_threshold: Number(v("lockout_threshold")),
        lockout_window_minutes: Number(v("lockout_window_minutes")),
        lockout_auto_unlock_minutes:
          autoUnlock === null || autoUnlock === undefined ? null : Number(autoUnlock),
        min_password_length: Number(v("min_password_length")),
        enforce_password_change: Boolean(v("enforce_password_change")),
        password_require_upper: Boolean(v("password_require_upper")),
        password_require_lower: Boolean(v("password_require_lower")),
        password_require_number: Boolean(v("password_require_number")),
        password_require_symbol: Boolean(v("password_require_symbol")),
        password_min_strength: Number(v("password_min_strength")),
        auto_logout_minutes: Number(v("auto_logout_minutes")),
        auto_logout_warning_seconds: Number(v("auto_logout_warning_seconds")),
        session_absolute_hours: Number(v("session_absolute_hours")),
        max_concurrent_sessions: Number(v("max_concurrent_sessions")),
        mfa_required_roles: requiredRoles,
        mfa_grace_days: Number(v("mfa_grace_days")),
        recaptcha_enabled: Boolean(v("recaptcha_enabled")),
        recaptcha_site_key: String(v("recaptcha_site_key") ?? "").trim() || null,
        recaptcha_min_score: Number(v("recaptcha_min_score") ?? 0.5),
      };

      // Client-side sanity checks with clear messages (the database also
      // enforces the same ranges).
      if (next.lockout_threshold! < 1 || next.lockout_threshold! > 20)
        throw new Error("Failed-attempt threshold must be between 1 and 20.");
      if (next.lockout_window_minutes! < 1 || next.lockout_window_minutes! > 1440)
        throw new Error("Lockout window must be between 1 and 1440 minutes.");
      if (next.min_password_length! < 6 || next.min_password_length! > 64)
        throw new Error("Minimum password length must be between 6 and 64.");
      if (next.password_min_strength! < 1 || next.password_min_strength! > 5)
        throw new Error("Minimum password strength must be between 1 and 5.");
      if (next.auto_logout_warning_seconds! >= next.auto_logout_minutes! * 60)
        throw new Error("Idle warning lead time must be shorter than the idle timeout.");
      if (next.session_absolute_hours! > 0 && next.session_absolute_hours! * 60 <= next.auto_logout_minutes!)
        throw new Error("Maximum session length must be longer than the idle timeout.");
      if (next.recaptcha_min_score! < 0 || next.recaptcha_min_score! > 1)
        throw new Error("reCAPTCHA minimum score must be between 0.0 and 1.0.");
      if (next.recaptcha_enabled && !next.recaptcha_site_key)
        throw new Error("Add a reCAPTCHA v3 site key before enabling bot protection.");


      const { error } = await supabase
        .from("app_settings")
        .update(next as never)
        .eq("id", row.id);
      if (error) throw error;

      // Audit which policy fields actually changed.
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(next) as (keyof PolicyRow)[]) {
        const before = row[key];
        const after = next[key];
        const same = Array.isArray(before) || Array.isArray(after)
          ? JSON.stringify(before ?? []) === JSON.stringify(after ?? [])
          : before === after;
        if (!same) changes[FIELD_LABELS[key as string] ?? String(key)] = { from: before, to: after };
      }
      if (Object.keys(changes).length > 0) {
        await logSecurityEvent({
          category: "account",
          action: "access_policy_updated",
          severity: "warn",
          subject: "Access policy",
          details: { changes },
        });
      }
      return Object.keys(changes).length;
    },
    onSuccess: (changed) => {
      queryClient.invalidateQueries({ queryKey: ["access-policy"] });
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      queryClient.invalidateQueries({ queryKey: ["password-policy"] });
      toast.success(changed ? `Access policy saved (${changed} change${changed === 1 ? "" : "s"}).` : "No changes to save.");
    },
    onError: (e: any) => toast.error(e.message || "Failed to save the access policy."),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading access policy...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          These controls are enforced on the server: login lockout, password validation, session
          lifetime and MFA requirements all read this policy. Every change is written to the security
          audit trail.
        </AlertDescription>
      </Alert>

      {/* Account lockout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4 w-4 text-destructive" /> Account Lockout
          </CardTitle>
          <CardDescription>
            How many failed sign-in attempts lock an account, and how the lock is lifted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="lockout-threshold">Failed attempts before lockout</Label>
              <Input
                id="lockout-threshold"
                type="number"
                min={1}
                max={20}
                value={Number(v("lockout_threshold") ?? 3)}
                onChange={(e) => set("lockout_threshold", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lockout-window">Counting window (minutes)</Label>
              <Input
                id="lockout-window"
                type="number"
                min={1}
                max={1440}
                value={Number(v("lockout_window_minutes") ?? 15)}
                onChange={(e) => set("lockout_window_minutes", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Attempts older than this no longer count towards the lockout.
              </p>
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Unlock automatically</p>
              <p className="text-xs text-muted-foreground">
                When off, a locked account stays locked until an administrator unlocks it.
              </p>
            </div>
            <Switch
              checked={autoUnlock !== null && autoUnlock !== undefined}
              onCheckedChange={(on) => set("lockout_auto_unlock_minutes", on ? 30 : (null as never))}
            />
          </div>
          {autoUnlock !== null && autoUnlock !== undefined && (
            <div className="space-y-2 max-w-xs">
              <Label htmlFor="auto-unlock">Unlock after (minutes of no failed attempts)</Label>
              <Input
                id="auto-unlock"
                type="number"
                min={1}
                max={10080}
                value={Number(autoUnlock)}
                onChange={(e) => set("lockout_auto_unlock_minutes", Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Password complexity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-chart-5" /> Password Complexity
          </CardTitle>
          <CardDescription>
            Applied to every password change, admin reset and bulk account creation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-length">Minimum length</Label>
              <Input
                id="min-length"
                type="number"
                min={6}
                max={64}
                value={Number(v("min_password_length") ?? 8)}
                onChange={(e) => set("min_password_length", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-strength">Minimum strength (1-5)</Label>
              <Input
                id="min-strength"
                type="number"
                min={1}
                max={5}
                value={Number(v("password_min_strength") ?? 4)}
                onChange={(e) => set("password_min_strength", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Matches the strength meter shown to users. 4 = "Strong".
              </p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {([
              ["password_require_upper", "Require an uppercase letter"],
              ["password_require_lower", "Require a lowercase letter"],
              ["password_require_number", "Require a number"],
              ["password_require_symbol", "Require a symbol"],
            ] as [keyof PolicyRow, string][]).map(([key, label]) => (
              <div key={String(key)} className="flex items-center gap-2">
                <Checkbox
                  id={String(key)}
                  checked={Boolean(v(key))}
                  onCheckedChange={(c) => set(key, Boolean(c) as never)}
                />
                <Label htmlFor={String(key)} className="text-sm font-normal">{label}</Label>
              </div>
            ))}
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Force password change on first login</p>
              <p className="text-xs text-muted-foreground">
                New accounts must set their own password before using the system.
              </p>
            </div>
            <Switch
              checked={Boolean(v("enforce_password_change"))}
              onCheckedChange={(c) => set("enforce_password_change", c)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Session limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-chart-4" /> Session Limits
          </CardTitle>
          <CardDescription>
            Idle timeout, maximum session length and how many devices a user may be signed in on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="idle-minutes">Idle timeout (minutes)</Label>
              <Input
                id="idle-minutes"
                type="number"
                min={1}
                max={480}
                value={Number(v("auto_logout_minutes") ?? 30)}
                onChange={(e) => set("auto_logout_minutes", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="idle-warning">Warning before logout (seconds)</Label>
              <Input
                id="idle-warning"
                type="number"
                min={5}
                max={300}
                value={Number(v("auto_logout_warning_seconds") ?? 30)}
                onChange={(e) => set("auto_logout_warning_seconds", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="absolute-hours">Maximum session length (hours)</Label>
              <Input
                id="absolute-hours"
                type="number"
                min={0}
                max={168}
                value={Number(v("session_absolute_hours") ?? 0)}
                onChange={(e) => set("session_absolute_hours", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Users are signed out this long after signing in, however active they are. 0 = no limit.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-sessions">Maximum simultaneous devices</Label>
              <Input
                id="max-sessions"
                type="number"
                min={0}
                max={20}
                value={Number(v("max_concurrent_sessions") ?? 0)}
                onChange={(e) => set("max_concurrent_sessions", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                Signing in beyond this limit ends the user's oldest session. 0 = unlimited.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MFA policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-destructive" /> Multi-Factor Authentication
          </CardTitle>
          <CardDescription>
            Which roles must complete a second factor, and how long new accounts have to enrol.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Roles that must use MFA</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {MFA_ROLE_CHOICES.map((r) => {
                const checked = requiredRoles.includes(r.value);
                return (
                  <div key={r.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`mfa-${r.value}`}
                      checked={checked}
                      onCheckedChange={(c) =>
                        set(
                          "mfa_required_roles",
                          (c
                            ? [...requiredRoles, r.value]
                            : requiredRoles.filter((x) => x !== r.value)) as never,
                        )
                      }
                    />
                    <Label htmlFor={`mfa-${r.value}`} className="text-sm font-normal">
                      {r.label}
                    </Label>
                  </div>
                );
              })}
            </div>
            {requiredRoles.length === 0 && (
              <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px] gap-1">
                <ShieldAlert className="h-3 w-3" /> No role currently requires MFA
              </Badge>
            )}
          </div>
          <Separator />
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="mfa-grace">Enrolment grace period (days)</Label>
            <Input
              id="mfa-grace"
              type="number"
              min={0}
              max={90}
              value={Number(v("mfa_grace_days") ?? 0)}
              onChange={(e) => set("mfa_grace_days", Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              New accounts may sign in without a second factor for this many days after creation.
              0 = MFA required immediately.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bot protection (reCAPTCHA v3) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-chart-2" /> Bot Protection (reCAPTCHA v3)
          </CardTitle>
          <CardDescription>
            Invisible Google reCAPTCHA v3 scoring on the sign-in screen. No puzzles for staff —
            requests that score below the threshold are rejected on the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Enable bot protection on sign-in</p>
              <p className="text-xs text-muted-foreground">
                Requires a v3 site key below and the reCAPTCHA secret key configured on the server.
              </p>
            </div>
            <Switch
              checked={Boolean(v("recaptcha_enabled"))}
              onCheckedChange={(c) => set("recaptcha_enabled", c)}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="recaptcha-site-key">Site key (public)</Label>
              <Input
                id="recaptcha-site-key"
                placeholder="6Lxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                value={String(v("recaptcha_site_key") ?? "")}
                onChange={(e) => set("recaptcha_site_key", e.target.value as never)}
              />
              <p className="text-xs text-muted-foreground">
                From Google reCAPTCHA admin console, type "reCAPTCHA v3". Safe to store here.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recaptcha-min-score">Minimum score (0.0 – 1.0)</Label>
              <Input
                id="recaptcha-min-score"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={Number(v("recaptcha_min_score") ?? 0.5)}
                onChange={(e) => set("recaptcha_min_score", Number(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                1.0 = very likely human. 0.5 is Google's recommended starting point; raise it only if
                you see automated attempts getting through.
              </p>
            </div>
          </div>
          {Boolean(v("recaptcha_enabled")) && !String(v("recaptcha_site_key") ?? "").trim() && (
            <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px] gap-1">
              <ShieldAlert className="h-3 w-3" /> Enabled but no site key — protection stays off
            </Badge>
          )}
        </CardContent>
      </Card>



      <Button
        onClick={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        className="gap-2 bg-primary hover:bg-primary/90"
      >
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saveMutation.isPending ? "Saving..." : "Save Access Policy"}
      </Button>
    </div>
  );
}

export default AccessPolicySettings;
