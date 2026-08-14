// src/components/settings/HrmExportDlpPanel.tsx
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileLock2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/date-format";

export function HrmExportDlpPanel() {
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ["hrm-export-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("hrm_export_settings").select("*").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: audit = [] } = useQuery({
    queryKey: ["hrm-export-audit"],
    queryFn: async () => {
      const { data } = await supabase
        .from("hrm_export_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const update = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase.from("hrm_export_settings").update(patch).eq("id", s!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hrm-export-settings"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!s) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileLock2 className="h-5 w-5 text-emerald-600" /> HRM Export DLP</CardTitle>
          <CardDescription>Permission-gated PDF/CSV exports of HRM data with optional confidentiality watermark.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium text-sm">Watermark PDF exports</div>
                <p className="text-xs text-muted-foreground">Adds diagonal CONFIDENTIAL stamp + footer.</p>
              </div>
              <Switch checked={s.watermark_pdf} onCheckedChange={v => update.mutate({ watermark_pdf: v })} />
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium text-sm">Watermark CSV exports</div>
                <p className="text-xs text-muted-foreground">Prepends classification + export metadata as comments.</p>
              </div>
              <Switch checked={s.watermark_csv} onCheckedChange={v => update.mutate({ watermark_csv: v })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Classification label</Label>
            <Input defaultValue={s.classification_label}
              onBlur={e => update.mutate({ classification_label: e.target.value.trim() || "CONFIDENTIAL" })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent HRM Exports</CardTitle>
          <CardDescription>Every permission-gated export is recorded here.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead>Watermark</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No exports recorded yet.</TableCell></TableRow>
                ) : audit.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{formatDateTime(a.created_at)}</TableCell>
                    <TableCell className="text-xs">{a.exported_label || "—"}</TableCell>
                    <TableCell className="text-xs">{a.export_kind}</TableCell>
                    <TableCell className="text-xs uppercase">{a.format}</TableCell>
                    <TableCell className="text-xs max-w-[220px] truncate">{a.subject}</TableCell>
                    <TableCell className="text-right text-xs">{a.row_count}</TableCell>
                    <TableCell>
                      {a.watermarked
                        ? <Badge className="bg-emerald-100 text-emerald-800">Yes</Badge>
                        : <Badge variant="outline">No</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
