import React, { useState, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Eye, Download, Pencil, Printer, Users, MapPin, CalendarDays, FileText, FileSpreadsheet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { downloadBlob } from "@/lib/download-utils";
import { exportReport, type ExportFormat } from "@/lib/export-utils";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface OpRecord {
  id: string;
  operation_type: string;
  operation_date: string;
  location: string | null;
  severity: string;
  suspects_count: number;
  arrests_count: number;
  status: string;
  description: string | null;
  outcome: string | null;
  notes: string | null;
  officer_in_charge: string | null;
  contact_details?: string | null;
}

export interface ProfileRef {
  id: string;
  first_name: string;
  last_name: string;
  user_id: string | null;
  ranks: { abbreviation: string } | null;
  departments: { name: string } | null;
}

const SEVERITY_COLORS: Record<string, string> = { low: "bg-green-100 text-green-800", medium: "bg-yellow-100 text-yellow-800", high: "bg-orange-100 text-orange-800", critical: "bg-red-100 text-red-800" };
const STATUS_COLORS: Record<string, string> = { open: "bg-blue-100 text-blue-800", in_progress: "bg-amber-100 text-amber-800", closed: "bg-muted text-muted-foreground", resolved: "bg-green-100 text-green-800" };

// ─── Column-selection Print Dialog ────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: "date", label: "Date" },
  { key: "type", label: "Type" },
  { key: "location", label: "Location" },
  { key: "officer", label: "Intel By (Officer)" },
  { key: "contact", label: "Contact Details" },
  { key: "severity", label: "Severity" },
  { key: "suspects", label: "Suspects" },
  { key: "arrests", label: "Arrests" },
  { key: "status", label: "Status" },
  { key: "description", label: "Description" },
  { key: "outcome", label: "Outcome" },
  { key: "notes", label: "Notes" },
];

function resolveOfficer(op: OpRecord, profiles: ProfileRef[]) {
  if (!op.officer_in_charge) return "—";
  const p = profiles.find(pr => pr.user_id === op.officer_in_charge || pr.id === op.officer_in_charge);
  return p ? `${p.ranks?.abbreviation ? p.ranks.abbreviation + ". " : ""}${p.first_name} ${p.last_name}` : "—";
}

function getColumnValue(key: string, op: OpRecord, profiles: ProfileRef[]) {
  switch (key) {
    case "date": return format(new Date(op.operation_date), "dd MMM yyyy");
    case "type": return op.operation_type.replace(/_/g, " ");
    case "location": return op.location || "—";
    case "officer": return resolveOfficer(op, profiles);
    case "contact": return op.contact_details || "—";
    case "severity": return op.severity;
    case "suspects": return String(op.suspects_count);
    case "arrests": return String(op.arrests_count);
    case "status": return op.status.replace(/_/g, " ");
    case "description": return op.description || "—";
    case "outcome": return op.outcome || "—";
    case "notes": return op.notes || "—";
    default: return "";
  }
}

interface PrintColumnDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  operations: OpRecord[];
  profiles: ProfileRef[];
  title: string;
}

export function PrintColumnDialog({ open, onOpenChange, operations, profiles, title }: PrintColumnDialogProps) {
  const [selectedCols, setSelectedCols] = useState<Set<string>>(
    new Set(["date", "type", "location", "severity", "suspects", "arrests", "status"])
  );

  const toggleCol = (key: string) => {
    setSelectedCols(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCols.size === ALL_COLUMNS.length) {
      setSelectedCols(new Set());
    } else {
      setSelectedCols(new Set(ALL_COLUMNS.map(c => c.key)));
    }
  };

  const getSelectedData = () => {
    const cols = ALL_COLUMNS.filter(c => selectedCols.has(c.key));
    const headers = cols.map(c => c.label);
    const rows = operations.map(op => cols.map(c => getColumnValue(c.key, op, profiles)));
    return { cols, headers, rows };
  };

  const handlePrint = () => {
    const { cols } = getSelectedData();
    if (cols.length === 0) return;

    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const isDark = document.documentElement.classList.contains("dark");
    const bg = isDark ? "#1e293b" : "#fff";
    const fg = isDark ? "#e2e8f0" : "#1e293b";
    const borderCol = isDark ? "#334155" : "#e2e8f0";

    const html = `<!DOCTYPE html><html><head><title>${esc(title)}</title>
<style>
  @media print { @page { size: ${cols.length > 6 ? "landscape" : "portrait"}; margin: 12mm; } }
  body { font-family: system-ui, sans-serif; font-size: 11px; color: ${fg}; background: ${bg}; margin: 0; padding: 16px; }
  h2 { font-size: 16px; margin: 0 0 2px; color: #006699; }
  h3 { font-size: 12px; margin: 0 0 8px; color: ${fg}; }
  .meta { font-size: 9px; color: #888; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: ${isDark ? "#334155" : "#f1f5f9"}; text-align: left; padding: 6px 8px; border: 1px solid ${borderCol}; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.02em; }
  td { padding: 5px 8px; border: 1px solid ${borderCol}; font-size: 10px; }
  tr:nth-child(even) { background: ${isDark ? "#1a2332" : "#f8fafc"}; }
  .footer { text-align: center; margin-top: 16px; font-size: 9px; color: #888; }
</style></head><body>
  <h2>GIS Amasaman Sector Command</h2>
  <h3>${esc(title)}</h3>
  <div class="meta">Generated: ${format(new Date(), "dd MMM yyyy HH:mm")} · ${operations.length} records</div>
  <table>
    <thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${operations.map(op =>
      `<tr>${cols.map(c => `<td style="text-transform:capitalize">${esc(getColumnValue(c.key, op, profiles))}</td>`).join("")}</tr>`
    ).join("")}</tbody>
  </table>
  <div class="footer">CONFIDENTIAL — Ghana Immigration Service</div>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
    onOpenChange(false);
  };

  const handleDownload = (fmt: ExportFormat) => {
    const { headers, rows } = getSelectedData();
    if (headers.length === 0) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    exportReport(fmt, {
      title,
      filename: slug,
      headers,
      rows,
      subtitle: `${operations.length} records · Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Print / Download — Select Columns</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox checked={selectedCols.size === ALL_COLUMNS.length} onCheckedChange={toggleAll} id="toggle-all" />
            <label htmlFor="toggle-all" className="text-sm font-medium cursor-pointer">Select All</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ALL_COLUMNS.map(c => (
              <div key={c.key} className="flex items-center gap-2">
                <Checkbox checked={selectedCols.has(c.key)} onCheckedChange={() => toggleCol(c.key)} id={`col-${c.key}`} />
                <label htmlFor={`col-${c.key}`} className="text-sm cursor-pointer">{c.label}</label>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={selectedCols.size === 0} className="gap-1">
                  <Download className="h-4 w-4" /> Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleDownload("pdf")}><FileText className="h-4 w-4 mr-2" /> PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload("excel")}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload("csv")}><FileText className="h-4 w-4 mr-2" /> CSV</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDownload("word")}><FileText className="h-4 w-4 mr-2" /> Word</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handlePrint} disabled={selectedCols.size === 0} className="gap-1">
              <Printer className="h-4 w-4" /> Print ({selectedCols.size} cols)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Detail Dialog ───────────────────────────────────────────────────────
interface ViewDetailDialogProps {
  op: OpRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profiles: ProfileRef[];
  moduleTitle: string;
}

export function ViewDetailDialog({ op, open, onOpenChange, profiles, moduleTitle }: ViewDetailDialogProps) {
  if (!op) return null;
  const officer = resolveOfficer(op, profiles);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" /> {moduleTitle} Detail
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Type</p>
              <p className="capitalize font-medium">{op.operation_type.replace(/_/g, " ")}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Date</p>
              <p className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />{format(new Date(op.operation_date), "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Location</p>
              <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{op.location || "—"}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Severity</p>
              <Badge className={SEVERITY_COLORS[op.severity] || ""}>{op.severity}</Badge>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Status</p>
              <Badge className={STATUS_COLORS[op.status] || ""}>{op.status.replace(/_/g, " ")}</Badge>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Suspects / Arrests</p>
              <p><span className="font-semibold">{op.suspects_count}</span> suspects · <span className="font-semibold text-destructive">{op.arrests_count}</span> arrests</p>
            </div>
            <div className="col-span-2">
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Intel By (Officer)</p>
              <p className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-muted-foreground" />{officer}</p>
            </div>
            {op.contact_details && (
              <div className="col-span-2">
                <p className="font-medium text-muted-foreground text-xs mb-0.5">Contact Details</p>
                <p>{op.contact_details}</p>
              </div>
            )}
          </div>
          <div className="border-t pt-3 space-y-3">
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Description</p>
              <p className="text-sm">{op.description || "No description provided"}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Outcome</p>
              <p className="text-sm">{op.outcome || "Pending"}</p>
            </div>
            <div>
              <p className="font-medium text-muted-foreground text-xs mb-0.5">Notes</p>
              <p className="text-sm">{op.notes || "No additional notes"}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Download single record as PDF ────────────────────────────────────────────
export function downloadOperationPDF(op: OpRecord, profiles: ProfileRef[], moduleTitle: string) {
  const officer = resolveOfficer(op, profiles);
  const doc = new jsPDF({ orientation: "portrait" });

  doc.setFontSize(16);
  doc.setTextColor(0, 102, 153);
  doc.text("GIS Amasaman Sector Command", 14, 15);
  doc.setFontSize(12);
  doc.setTextColor(60, 60, 60);
  doc.text(`${moduleTitle} Record`, 14, 23);
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 29);

  const rows = [
    ["Type", op.operation_type.replace(/_/g, " ")],
    ["Date", format(new Date(op.operation_date), "dd MMM yyyy")],
    ["Location", op.location || "—"],
    ["Severity", op.severity],
    ["Status", op.status.replace(/_/g, " ")],
    ["Suspects", String(op.suspects_count)],
    ["Arrests", String(op.arrests_count)],
    ["Intel By (Officer)", officer],
    ["Contact Details", op.contact_details || "—"],
    ["Description", op.description || "—"],
    ["Outcome", op.outcome || "—"],
    ["Notes", op.notes || "—"],
  ];

  autoTable(doc, {
    startY: 34,
    head: [["Field", "Value"]],
    body: rows,
    styles: { fontSize: 10, cellPadding: 4 },
    headStyles: { fillColor: [0, 102, 153], textColor: 255 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 50 } },
  });

  const y = (doc as any).lastAutoTable?.finalY || 200;
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text("CONFIDENTIAL — Ghana Immigration Service", 105, y + 15, { align: "center" });

  const blob = doc.output("blob");
  downloadBlob(blob, `${moduleTitle.toLowerCase().replace(/\s+/g, "-")}-${op.id.slice(0, 8)}.pdf`);
}

// ─── Row Actions Component ────────────────────────────────────────────────────
interface RowActionsProps {
  op: OpRecord;
  profiles: ProfileRef[];
  moduleTitle: string;
  onEdit: (op: OpRecord) => void;
  onView: (op: OpRecord) => void;
}

export function OperationRowActions({ op, profiles, moduleTitle, onEdit, onView }: RowActionsProps) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onView(op); }} title="View details">
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(op); }} title="Edit operation">
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); downloadOperationPDF(op, profiles, moduleTitle); }} title="Download PDF">
        <Download className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
