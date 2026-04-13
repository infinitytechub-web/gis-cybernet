import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActiveFilter {
  label: string;
  value: string;
  onClear: () => void;
}

interface FilterSummaryBarProps {
  filters: ActiveFilter[];
  totalResults: number;
  onClearAll: () => void;
}

export function FilterSummaryBar({ filters, totalResults, onClearAll }: FilterSummaryBarProps) {
  const activeFilters = filters.filter((f) => f.value);
  if (activeFilters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap px-1 py-2 rounded-md bg-muted/50 border border-border">
      <span className="text-xs text-muted-foreground ml-2">Active filters:</span>
      {activeFilters.map((f) => (
        <Badge key={f.label} variant="secondary" className="gap-1 text-xs">
          {f.label}: {f.value}
          <button onClick={f.onClear} className="ml-0.5 hover:text-destructive">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <span className="text-xs text-muted-foreground">— {totalResults} result{totalResults !== 1 ? "s" : ""}</span>
      <Button variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={onClearAll}>
        Clear All
      </Button>
    </div>
  );
}
