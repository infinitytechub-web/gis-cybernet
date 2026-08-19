/**
 * Administrator oversight of every enrolled biometric credential.
 * Admins can review enrolled devices per staff member and revoke any of them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Fingerprint, RefreshCw, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/date-format";

interface AdminCredential {
  id: string;
  user_id: string;
  full_name: string | null;
  staff_id: string | null;
  device_label: string;
  backed_up: boolean;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export function BiometricAdminPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminCredential[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("webauthn_admin_list_credentials");
    if (error) {
      toast({ title: "Could not load credentials", description: error.message, variant: "destructive" });
    }
    setRows((data as AdminCredential[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.full_name, r.staff_id, r.device_label].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  const revoke = useCallback(async (row: AdminCredential) => {
    const { error } = await supabase.rpc("webauthn_revoke_credential", {
      _id: row.id,
      _reason: "Revoked by an administrator",
    });
    if (error) {
      toast({ title: "Could not revoke", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Credential revoked", description: `${row.device_label} can no longer sign in.` });
    await load();
  }, [load, toast]);

  const active = rows.filter((r) => !r.revoked_at).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Fingerprint className="h-5 w-5 text-primary" aria-hidden="true" />
          Enrolled Biometric Devices
          <Badge variant="secondary">{active} active</Badge>
        </CardTitle>
        <CardDescription>
          Every device registered for fingerprint or Face ID sign-in. Revoking a device forces that
          staff member back to password sign-in on it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Search by name, staff ID or device"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search enrolled biometric devices"
          />
          <Button variant="outline" onClick={load} disabled={loading} aria-label="Refresh list">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-[700px]">
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Device</TableHead>
                <TableHead>Enrolled</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7}>Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7}>No enrolled devices.</TableCell></TableRow>
              ) : filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.full_name ?? "—"}</TableCell>
                  <TableCell>{r.staff_id ?? "—"}</TableCell>
                  <TableCell>{r.device_label}</TableCell>
                  <TableCell>{formatDate(r.created_at)}</TableCell>
                  <TableCell>{r.last_used_at ? formatDate(r.last_used_at) : "Never"}</TableCell>
                  <TableCell>
                    {r.revoked_at
                      ? <Badge variant="outline">Revoked {formatDate(r.revoked_at)}</Badge>
                      : <Badge>Active</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {!r.revoked_at && (
                      <Button variant="outline" size="sm" onClick={() => revoke(r)} aria-label={`Revoke ${r.device_label}`}>
                        <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default BiometricAdminPanel;
