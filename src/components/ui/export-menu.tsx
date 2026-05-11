import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet, FileType } from "lucide-react";
import { toast } from "sonner";
// Lazy-load the heavy export-utils module (pulls in jspdf + xlsx). Keeping
// it out of the static graph means pages that merely render an ExportMenu
// don't ship those libraries in their initial chunk — and crucially, eager
// modules like Layout/SystemAuditTray no longer pull jspdf+xlsx into the
// login bundle.
import type { ExportFormat } from "@/lib/export-utils";

type ExportPayload = {
  title: string;
  filename: string;
  headers: string[];
  rows: string[][];
  subtitle?: string;
  /** Forwarded straight to exportReport — see ExportEmbeddedImage. */
  image?: import("@/lib/export-utils").ExportEmbeddedImage;
};

interface ExportMenuProps {
  /**
   * Returns the data to export. Called lazily when a format is selected so that
   * filtered/computed data is always fresh. Return `null` to silently abort
   * (e.g., when nothing is selected). For an "empty" toast, return rows: [].
   *
   * The chosen format is passed in so callers can attach format-specific
   * payload (e.g., embed an offline coordinate snapshot only for PDF). May
   * return a Promise to support async snapshot rasterization.
   */
  getData: (fmt: ExportFormat) => ExportPayload | Promise<ExportPayload | null> | null;
  /** Visible label inside the trigger button. Defaults to "Export". */
  label?: string;
  /** Show only the icon (no label). */
  iconOnly?: boolean;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  disabled?: boolean;
  /** Override available formats. Defaults to all four. */
  formats?: ExportFormat[];
  /** Called after a successful export. Receives the chosen format. */
  onExported?: (fmt: ExportFormat) => void;
}

const FORMAT_META: Record<ExportFormat, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  pdf: { icon: FileText, label: "PDF" },
  csv: { icon: FileSpreadsheet, label: "CSV" },
  excel: { icon: FileSpreadsheet, label: "Excel (.xlsx)" },
  word: { icon: FileType, label: "Word (.doc)" },
};

const DEFAULT_FORMATS: ExportFormat[] = ["pdf", "csv", "excel", "word"];

/**
 * Unified export dropdown — offers PDF, CSV, Excel and Word for any tabular dataset.
 * Use everywhere data exports are needed for consistency.
 */
export function ExportMenu({
  getData,
  label = "Export",
  iconOnly = false,
  variant = "outline",
  size = "sm",
  className,
  disabled,
  formats = DEFAULT_FORMATS,
  onExported,
}: ExportMenuProps) {
  const handleExport = async (fmt: ExportFormat) => {
    try {
      const result = getData(fmt);
      const data = result instanceof Promise ? await result : result;
      if (!data) return;
      if (!data.rows || data.rows.length === 0) {
        toast.error("No data to export");
        return;
      }
      const { exportReport, getFormatLabel } = await import("@/lib/export-utils");
      exportReport(fmt, data);
      toast.success(`${getFormatLabel(fmt)} downloaded`);
      onExported?.(fmt);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={iconOnly ? "icon" : size} className={className} disabled={disabled}>
          <Download className="h-4 w-4" />
          {!iconOnly && <span className="ml-1">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map((f) => {
          const Icon = FORMAT_META[f].icon;
          return (
            <DropdownMenuItem key={f} onClick={() => handleExport(f)} className="gap-2">
              <Icon className="h-4 w-4" /> {FORMAT_META[f].label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
