import { useEffect, useState } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_PAGE_SIZE } from "@/hooks/usePagedList";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize?: (n: number) => void;
  label?: string;
  className?: string;
};

/**
 * Standard pager used by every long list. Renders nothing when the list fits
 * on one default-size page (≤ 25 records).
 */
export function ListPagination({
  page, totalPages, total, from, to, pageSize, setPage, setPageSize, label = "records", className,
}: Props) {
  const [jump, setJump] = useState(String(page));
  useEffect(() => setJump(String(page)), [page]);
  if (total <= DEFAULT_PAGE_SIZE) return null;

  const go = (p: number) => setPage(Math.min(totalPages, Math.max(1, p)));

  return (
    <nav
      aria-label={`${label} pagination`}
      className={cn("flex flex-wrap items-center justify-between gap-2 pt-2 text-xs text-muted-foreground", className)}
    >
      <span aria-live="polite">Showing {from}–{to} of {total} {label}</span>
      <div className="flex flex-wrap items-center gap-1">
        {setPageSize && (
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[92px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(1)} disabled={page <= 1} aria-label="First page"><ChevronFirst className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <span className="flex items-center gap-1 px-1">
          Page
          <Input
            aria-label="Go to page"
            inputMode="numeric"
            className="h-8 w-12 px-1 text-center"
            value={jump}
            onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => { if (e.key === "Enter") go(Number(jump) || 1); }}
            onBlur={() => go(Number(jump) || 1)}
          />
          of {totalPages}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(page + 1)} disabled={page >= totalPages} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => go(totalPages)} disabled={page >= totalPages} aria-label="Last page"><ChevronLast className="h-4 w-4" /></Button>
      </div>
    </nav>
  );
}
