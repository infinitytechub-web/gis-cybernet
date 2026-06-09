import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, Download } from "lucide-react";

interface ReportPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  url: string;
  fileType: string;
  fileName: string;
}

export default function ReportPreviewDialog({ open, onClose, url, fileType, fileName }: ReportPreviewDialogProps) {
  const isPdf = fileType === "application/pdf";
  const isImage = fileType.startsWith("image/");
  const isCsv = fileType === "text/csv";

  const handlePrint = () => {
    const w = window.open(url, "_blank");
    if (w) {
      w.onload = () => w.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Preview: {fileName}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={handlePrint}>
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button variant="outline" size="sm" className="gap-1" asChild>
                <a href={url} download={fileName}><Download className="h-4 w-4" /> Download</a>
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-auto min-h-[400px]">
          {isPdf ? (
            <iframe src={url} className="w-full h-[70vh] border rounded" title={fileName} />
          ) : isImage ? (
            <img src={url} alt={fileName} loading="lazy" decoding="async" className="max-w-full mx-auto rounded" />
          ) : isCsv ? (
            <div className="p-4 text-sm text-muted-foreground">
              CSV preview not available. Please download the file to view its contents.
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Preview not available for this file type. Please download the file.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
