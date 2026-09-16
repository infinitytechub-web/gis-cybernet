import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, FileText, FileType, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { BIODATA_FORMAT_LABELS, type BioDataFormat } from "@/lib/biodata-export";

const ICONS: Record<BioDataFormat, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  word: FileType,
  excel: FileSpreadsheet,
  csv: FileSpreadsheet,
};

/**
 * Download the full bio-data & service record in PDF, Word, Excel or CSV.
 * The record is fetched and the format library loaded only when a format is
 * chosen, so nothing heavy loads with the form itself.
 */
export function BioDataDownloadMenu({
  profileId,
  formats = ["pdf", "word", "excel", "csv"],
  label = "Download record",
  variant = "outline",
  size = "sm",
  className,
}: {
  profileId: string;
  formats?: BioDataFormat[];
  label?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}) {
  const [busy, setBusy] = useState<BioDataFormat | null>(null);

  const run = async (fmt: BioDataFormat) => {
    setBusy(fmt);
    try {
      const { downloadBioDataRecord } = await import("@/lib/biodata-export");
      await downloadBioDataRecord(profileId, fmt);
      toast.success(`Record downloaded — ${BIODATA_FORMAT_LABELS[fmt]}`);
    } catch (e: any) {
      toast.error(e?.message || "Could not build that copy of the record");
    } finally {
      setBusy(null);
    }
  };

  const SHORT: Record<BioDataFormat, string> = { pdf: "PDF", word: "Word", excel: "Excel", csv: "CSV" };

  return (
    <>
      {/* Phone: all formats in one row — no menu digging on a small screen. */}
      <div className={`grid w-full grid-cols-4 gap-1 sm:hidden ${className ?? ""}`}>
        {formats.map((fmt) => {
          const Icon = ICONS[fmt];
          return (
            <Button
              key={fmt}
              type="button"
              variant={variant}
              size="sm"
              disabled={!!busy}
              onClick={() => void run(fmt)}
              className="h-auto flex-col gap-0.5 py-1.5"
            >
              {busy === fmt
                ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                : <Icon className="h-4 w-4" aria-hidden="true" />}
              <span className="text-[10px] leading-none">{SHORT[fmt]}</span>
            </Button>
          );
        })}
      </div>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size={size} className={`hidden sm:inline-flex ${className ?? ""}`} disabled={!!busy}>
          {busy
            ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
            : <Download className="mr-1 h-4 w-4" aria-hidden="true" />}
          {busy ? "Preparing…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Choose a format</DropdownMenuLabel>
        {formats.map((fmt) => {
          const Icon = ICONS[fmt];
          return (
            <DropdownMenuItem key={fmt} onClick={() => void run(fmt)} disabled={!!busy}>
              {busy === fmt
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Icon className="mr-2 h-4 w-4" aria-hidden="true" />}
              {BIODATA_FORMAT_LABELS[fmt]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
