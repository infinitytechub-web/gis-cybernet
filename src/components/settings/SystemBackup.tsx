import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, DatabaseBackup, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { downloadBlob } from "@/lib/download-utils";
import { format } from "date-fns";

/**
 * Quick System Backup — admin-only.
 * Exports selected core tables as a single JSON snapshot file.
 * Note: Uses RLS-bound client; admin policies grant full read on these tables.
 */
const BACKUP_TABLES = [
  { name: "profiles", label: "Staff Profiles", critical: true },
  { name: "user_roles", label: "User Roles", critical: true },
  { name: "departments", label: "Departments", critical: true },
  { name: "ranks", label: "Ranks / Designations", critical: true },
  { name: "shifts", label: "Shifts", critical: false },
  { name: "shift_assignments", label: "Shift Assignments", critical: false },
  { name: "attendances", label: "Attendance Records", critical: false },
  { name: "leave_requests", label: "Leave Requests", critical: false },
  { name: "postings_transfers", label: "Postings & Transfers", critical: false },
  { name: "holidays", label: "Holidays", critical: false },
  { name: "announcements", label: "Announcements", critical: false },
  { name: "app_settings", label: "App Settings", critical: true },
] as const;

export function SystemBackup() {
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(BACKUP_TABLES.map((t) => t.name))
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");

  if (!isAdmin) {
    return (
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>System backup is restricted to administrators.</AlertDescription>
      </Alert>
    );
  }

  const toggle = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
  };

  const runBackup = async () => {
    if (selected.size === 0) {
      toast.error("Select at least one table to back up.");
      return;
    }
    setBusy(true);
    const snapshot: Record<string, unknown> = {
      _meta: {
        generated_at: new Date().toISOString(),
        version: "1.0",
        tables: Array.from(selected),
      },
    };
    const errors: string[] = [];

    for (const t of BACKUP_TABLES) {
      if (!selected.has(t.name)) continue;
      setProgress(`Exporting ${t.label}…`);
      try {
        // Page through (RLS-aware) to bypass the 1000-row default
        const pageSize = 1000;
        let from = 0;
        const rows: any[] = [];
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data, error } = await supabase
            .from(t.name as any)
            .select("*")
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          rows.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        snapshot[t.name] = rows;
      } catch (e: any) {
        errors.push(`${t.label}: ${e.message ?? "unknown error"}`);
        snapshot[t.name] = { error: e.message ?? "failed" };
      }
    }

    setProgress("");
    const stamp = format(new Date(), "yyyyMMdd-HHmmss");
    const filename = `cybernet-backup-${stamp}.json`;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    downloadBlob(blob, filename);
    setBusy(false);

    if (errors.length) {
      toast.warning(`Backup completed with ${errors.length} warning(s). See file for details.`);
    } else {
      toast.success(`Backup downloaded: ${filename}`);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5 text-primary" /> Quick System Backup
        </CardTitle>
        <CardDescription>
          Export a JSON snapshot of selected tables. For administrator use only.
          Files are generated in your browser and downloaded directly — no data leaves the platform.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BACKUP_TABLES.map((t) => (
            <label
              key={t.name}
              className="flex items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent/30 cursor-pointer"
            >
              <Checkbox
                checked={selected.has(t.name)}
                onCheckedChange={() => toggle(t.name)}
                disabled={busy}
              />
              <span className="flex-1">{t.label}</span>
              {t.critical && (
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  core
                </Badge>
              )}
            </label>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={runBackup} disabled={busy || selected.size === 0}>
            {busy ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Backing up…</>
            ) : (
              <><Download className="h-4 w-4 mr-2" /> Download Backup</>
            )}
          </Button>
          {progress && <span className="text-xs text-muted-foreground">{progress}</span>}
          <span className="text-xs text-muted-foreground ml-auto">
            {selected.size} of {BACKUP_TABLES.length} tables selected
          </span>
        </div>

        <Alert>
          <AlertDescription className="text-xs">
            Tip: Store backups in secure, access-controlled storage. The export contains
            personally identifiable information and must be handled per the
            command's data protection policy.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
