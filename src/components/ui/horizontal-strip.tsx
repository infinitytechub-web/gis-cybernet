import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Contained touch/keyboard scrolling with visible edge controls. */
export function HorizontalStrip({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const next = { left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 };
      setEdges(old => old.left === next.left && old.right === next.right ? old : next);
    };
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    el.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); el.removeEventListener("scroll", update); };
  }, [children]);
  const scroll = (direction: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return (
    <section className="min-w-0 max-w-full space-y-1" aria-label={label}>
      <div className="flex justify-end gap-1">
        <Button variant="outline" size="icon" className="h-9 w-9" disabled={!edges.left} aria-label={`Scroll ${label} left`} title={`Scroll ${label} left`} onClick={() => scroll(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="icon" className="h-9 w-9" disabled={!edges.right} aria-label={`Scroll ${label} right`} title={`Scroll ${label} right`} onClick={() => scroll(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div ref={ref} tabIndex={0} role="region" aria-label={`${label} items`} className={cn("flex min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-2 scroll-smooth-gpu", className)}>{children}</div>
    </section>
  );
}