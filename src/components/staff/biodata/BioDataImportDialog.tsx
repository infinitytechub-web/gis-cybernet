/**
 * PREFILL FROM SPREADSHEET
 *
 * Reads a roster spreadsheet, lists the people it found, and lets the user pick
 * one row to pre-fill the Bio-Data form. Nothing is saved until the user
 * reviews the form and presses save, so this is a read-only helper.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileSpreadsheet, Loader2, Search, Upload } from "lucide-react";
import {
  parseBioDataWorkbook, prefillFieldCount, type BioDataPrefillRow,
} from "@/lib/biodata-import";

export function BioDataImportDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (row: BioDataPrefillRow) => void;
}) {
  const [rows, setRows] = useState<BioDataPrefillRow[] | null>(null);
  const [filename, setFilename] = useState("");
  const [parsing, setParsing] = useState(false);
  const [search, setSearch] = useState("");

  const handleFile = async (file: File) => {
    setParsing(true);
    setFilename(file.name);
    try {
      const parsed = await parseBioDataWorkbook(file);
      setRows(parsed);
      toast.success(`${parsed.length} row(s) read from ${file.name}`);
    } catch (e: any) {
      setRows(null);
      toast.error(e?.message || "Could not read that file");
    } finally {
      setParsing(false);
    }
  };

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.label.toLowerCase().includes(q));
  }, [rows, search]);

  const unmapped = useMemo(() => {
    const set = new Set<string>();
    (rows ?? []).forEach((r) => r.unmapped.forEach((h) => set.add(h)));
    return [...set].slice(0, 12);
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
            Prefill from spreadsheet
          </DialogTitle>
          <DialogDescription>
            Upload your roster file (.xlsx, .xls or .csv), find the person, and the matching
            details drop into the form for you to check before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="biodata-import-file"
              className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-muted/50"
            >
              {parsing ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              ) : (
                <Upload className="h-6 w-6 text-primary" aria-hidden="true" />
              )}
              <span className="text-sm font-medium">
                {filename || "Choose a spreadsheet"}
              </span>
              <span className="text-xs text-muted-foreground">
                The first sheet is read. Column names are matched automatically.
              </span>
            </label>
            <input
              id="biodata-import-file"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {rows && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  className="pl-9"
                  placeholder="Search by name, ID, rank or department"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search the spreadsheet rows"
                />
              </div>

              {unmapped.length > 0 && (
                <Alert>
                  <AlertTitle className="text-sm">Columns not recognised</AlertTitle>
                  <AlertDescription className="text-xs">
                    {unmapped.join(", ")} — these are ignored. Rename them to match a form
                    label and upload again if you want them filled in.
                  </AlertDescription>
                </Alert>
              )}

              <ul className="max-h-[320px] space-y-2 overflow-y-auto">
                {filtered.slice(0, 200).map((row) => (
                  <li
                    key={row.index}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.label}</p>
                      <p className="text-xs text-muted-foreground">
                        Row {row.index} · {prefillFieldCount(row)} detail(s) found
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => {
                        onApply(row);
                        onOpenChange(false);
                      }}
                    >
                      Use this row
                    </Button>
                  </li>
                ))}
                {filtered.length === 0 && (
                  <li className="rounded-lg border p-4 text-center text-sm text-muted-foreground">
                    No row matches that search.
                  </li>
                )}
              </ul>
              {filtered.length > 200 && (
                <Badge variant="outline">Showing the first 200 of {filtered.length} matches</Badge>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default BioDataImportDialog;
