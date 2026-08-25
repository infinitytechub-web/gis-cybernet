import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings2, Shield, Clock, Globe, Loader2, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface AppSettingsRow {
  id: string;
  org_name: string;
  system_label: string;
  auto_logout_minutes: number;
  auto_logout_warning_seconds: number;
  enforce_password_change: boolean;
  min_password_length: number;
  allow_self_registration: boolean;
  enable_system_health_widget: boolean;
}

export function AppSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["app-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("*")
        .limit(1)
        .single();
      if (error) throw error;
      return data as AppSettingsRow;
    },
  });

  const [orgName, setOrgName] = useState("");
  const [systemLabel, setSystemLabel] = useState("");
  const [autoLogout, setAutoLogout] = useState(5);
  const [autoLogoutWarn, setAutoLogoutWarn] = useState(30);
  const [enforcePasswordChange, setEnforcePasswordChange] = useState(true);
  const [minPasswordLength, setMinPasswordLength] = useState(8);
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(false);
  const [enableHealthWidget, setEnableHealthWidget] = useState(true);

  useEffect(() => {
    if (settings) {
      setOrgName(settings.org_name);
      setSystemLabel(settings.system_label);
      setAutoLogout(settings.auto_logout_minutes);
      setAutoLogoutWarn(settings.auto_logout_warning_seconds ?? 30);
      setEnforcePasswordChange(settings.enforce_password_change);
      setMinPasswordLength(settings.min_password_length);
      setAllowSelfRegistration(settings.allow_self_registration);
      setEnableHealthWidget(settings.enable_system_health_widget ?? true);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!settings?.id) throw new Error("No settings row found");
      if (autoLogout < 1 || autoLogout > 480) {
        throw new Error("Auto-logout must be between 1 and 480 minutes.");
      }
      if (autoLogoutWarn < 5 || autoLogoutWarn > 300) {
        throw new Error("Warning lead time must be between 5 and 300 seconds.");
      }
      if (autoLogoutWarn >= autoLogout * 60) {
        throw new Error("Warning lead time must be shorter than the inactivity window.");
      }
      const { error } = await supabase
        .from("app_settings")
        .update({
          org_name: orgName,
          system_label: systemLabel,
          auto_logout_minutes: autoLogout,
          auto_logout_warning_seconds: autoLogoutWarn,
          enforce_password_change: enforcePasswordChange,
          min_password_length: minPasswordLength,
          allow_self_registration: allowSelfRegistration,
          enable_system_health_widget: enableHealthWidget,
        })
        .eq("id", settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
      toast.success("Settings saved successfully.");
    },
    onError: (e: any) => {
      toast.error(e.message || "Failed to save settings.");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-chart-1" /> Organization</CardTitle>
          <CardDescription>Basic organization and branding settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input id="org-name" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system-label">System Label</Label>
              <Input id="system-label" value={systemLabel} onChange={(e) => setSystemLabel(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-destructive" /> Security Policy</CardTitle>
          <CardDescription>Registration control. Lockout thresholds, password complexity, session limits and MFA policy live in Security Settings → Access Policy.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow Self-Registration</p>
              <p className="text-xs text-muted-foreground">Let new users sign up without admin approval.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px] gap-1"><Shield className="h-3 w-3" /> Not Recommended</Badge>
              <Switch checked={allowSelfRegistration} onCheckedChange={setAllowSelfRegistration} />
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            Account lockout, password rules, idle/absolute session limits and MFA enforcement are configured on the <span className="font-medium">Access Policy</span> tab.
          </p>
        </CardContent>
      </Card>


      {/* Telemetry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-chart-2" /> Telemetry & Diagnostics</CardTitle>
          <CardDescription>Control the System Health widget and heavy in-browser telemetry collection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">System Health Widget</p>
              <p className="text-xs text-muted-foreground">
                When off, the admin dashboard widget is hidden and its FPS sampling, long-task observer,
                heap/DOM snapshots, and backend error polling stop completely.
              </p>
            </div>
            <Switch checked={enableHealthWidget} onCheckedChange={setEnableHealthWidget} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2 bg-primary hover:bg-primary/90">
        {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4 text-primary-foreground" />}
        {saveMutation.isPending ? "Saving..." : "Save Settings"}
      </Button>
    </div>
  );
}
