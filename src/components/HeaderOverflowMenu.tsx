import { useState } from "react";
import { LayoutGrid } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * HeaderOverflowMenu — collapses 3+ icon controls into a single tile.
 *
 * Use it when a horizontal navigation bar would otherwise show more than five
 * icon-buttons. Each child renders as a tile inside a 2-column popover grid,
 * preserving its own click handlers and badges.
 */
export function HeaderOverflowMenu({
  children,
  label = "More",
}: {
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <TooltipProvider>
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={label}
                className="relative h-9 w-9"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="p-2 w-56"
        onClick={() => setOpen(false)}
      >
        <div className="grid grid-cols-2 gap-1.5">
          {children}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
