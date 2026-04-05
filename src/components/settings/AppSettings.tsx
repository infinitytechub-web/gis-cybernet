import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings2, Shield, Clock, Globe } from "lucide-react";
import { toast } from "sonner";

export function AppSettings() {
  // These are local/display-only settings for now — could be persisted to a settings table later
  const [orgName, setOrgName] = useState("GIS Amasaman Sector Command");
  const [systemLabel, setSystemLabel] = useState("Cybernet");
  const [autoLogout, setAutoLogout] = useState(30);
  const [enforcePasswordChange, setEnforcePasswordChange] = useState(true);
  const [minPasswordLength, setMinPasswordLength] = useState(8);
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(false);

  const handleSave = () => {
    toast.success("Settings saved (client-side only). Backend persistence coming soon.");
  };

  return (
    <div className="space-y-6">
      {/* Organization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4" /> Organization</CardTitle>
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
          <CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4" /> Security Policy</CardTitle>
          <CardDescription>Password and authentication policies for all users.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Force Password Change on First Login</p>
              <p className="text-xs text-muted-foreground">Users must set their own password before accessing the system.</p>
            </div>
            <Switch checked={enforcePasswordChange} onCheckedChange={setEnforcePasswordChange} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow Self-Registration</p>
              <p className="text-xs text-muted-foreground">Let new users sign up without admin approval.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">Not Recommended</Badge>
              <Switch checked={allowSelfRegistration} onCheckedChange={setAllowSelfRegistration} />
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="min-pw">Minimum Password Length</Label>
              <Input id="min-pw" type="number" min={6} max={32} value={minPasswordLength} onChange={(e) => setMinPasswordLength(Number(e.target.value))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Clock className="h-4 w-4" /> Session</CardTitle>
          <CardDescription>Session timeout and activity settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="auto-logout">Auto-Logout After (minutes)</Label>
              <Input id="auto-logout" type="number" min={5} max={480} value={autoLogout} onChange={(e) => setAutoLogout(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground">Users will be signed out after this period of inactivity.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="gap-2">
        <Settings2 className="h-4 w-4" /> Save Settings
      </Button>
    </div>
  );
}
