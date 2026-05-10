import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollText, Download as DownloadIcon, Upload, Eye, Shield, Trash2 } from "lucide-react";
import { format } from "date-fns";

const ACTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All actions" },
  { value: "upload", label: "Upload" },
  { value: "download", label: "Download" },
  { value: "preview", label: "Preview" },
  { value: "permission_change", label: "Permission change" },
  { value: "delete", label: "Delete" },
];

const ICONS: Record<string, JSX.Element> = {
  upload: <Upload className="h-3 w-3" />,
  download: <DownloadIcon className="h-3 w-3" />,
  preview: <Eye className="h-3 w-3" />,
  permission_change: <Shield className="h-3 w-3" />,
  delete: <Trash2 className="h-3 w-3" />,
};

interface Props {
  fileId?: string | null;
  trigger?: React.ReactNode;
}

export function FileAuditTrailDialog({ fileId, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["announcement-file-audit", fileId ?? "all", action],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("announcement_file_audit")
        .select("*, announcement_files(title, filename)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (fileId) q = q.eq("file_id", fileId);
      if (action !== "all") q = q.eq("action", action as any);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = rows.filter((r: any) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return [
      r.staff_id, r.department_name, r.ip_address,
      r.announcement_files?.title, r.announcement_files?.filename,
    ].filter(Boolean).join(" ").toLowerCase().includes(s);
  });

  const exportCsv = () => {
    const header = ["Time", "Action", "Staff ID", "Department", "IP", "User Agent", "File", "Metadata"];
    const lines = [header.join(",")];
    for (const r of filtered as any[]) {
      const cells = [
        format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
        r.action,
        r.staff_id ?? "",
        r.department_name ?? "",
        r.ip_address ?? "",
        (r.user_agent ?? "").replace(/"/g, "'"),
        r.announcement_files?.title ?? r.file_id ?? "",
        JSON.stringify(r.metadata ?? {}).replace(/"/g, "'"),
      ];
      lines.push(cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `file-audit-${format(new Date(), "yyyyMMdd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-1.5">
            <ScrollText className="h-4 w-4" /> Audit Trail
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4" />
            Shared Files — Audit Trail
            {fileId && <Badge variant="outline" className="text-xs">Single file</Badge>}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search staff ID, department, IP, file…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 text-xs flex-1 min-w-[200px]"
          />
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-9 text-xs w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={filtered.length === 0}>
            <DownloadIcon className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        <div className="rounded-lg border overflow-x-auto max-h-[60vh] overflow-y-auto">
          <Table style={{ minWidth: 800 }}>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-[160px]">Time</TableHead>
                <TableHead className="w-[140px]">Action</TableHead>
                <TableHead>Staff ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>File</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">No audit events.</TableCell></TableRow>
              ) : filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(r.created_at), "dd MMM yyyy HH:mm:ss")}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1 text-xs capitalize">
                      {ICONS[r.action]}
                      {String(r.action).replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.staff_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{r.department_name ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    <div className="font-medium line-clamp-1">{r.announcement_files?.title ?? "(deleted)"}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{r.announcement_files?.filename ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{r.ip_address ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FileAuditTrailDialog;
