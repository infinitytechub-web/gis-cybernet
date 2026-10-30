import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine, ArrowLeftToLine, ArrowRightToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared fast navigation for pages, tables and nested record lists. */
export function QuickScroll({ containerRef, selector = "#main-content", className,
  label = "page", threshold = 24, position = "absolute", followActive = false,
}: {
  containerRef?: React.RefObject<HTMLElement>;
  selector?: string;
  className?: string;
  label?: string;
  threshold?: number;
  position?: "absolute" | "fixed" | "inline";
  followActive?: boolean;
}) {
  const [state, setState] = useState({ vertical: false, horizontal: false, top: true, bottom: true, left: true, right: true });
  const activeRef = useRef<HTMLElement | null>(null);
  const elRef = useRef<HTMLElement | null>(null);
  const resolve = useCallback(() => {
    const explicit = containerRef?.current;
    if (explicit) return explicit;
    const root = document.querySelector<HTMLElement>(selector);
    const active = activeRef.current;
    if (followActive && active?.isConnected && root?.contains(active) &&
      (active.scrollHeight > active.clientHeight + threshold || active.scrollWidth > active.clientWidth + threshold)) return active;
    if (root && (root.scrollHeight > root.clientHeight + threshold || root.scrollWidth > root.clientWidth + threshold)) return root;
    return root ? document.scrollingElement as HTMLElement | null : null;
  }, [containerRef, selector, followActive, threshold]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const el = resolve();
      elRef.current = el;
      const y = el ? el.scrollHeight - el.clientHeight : 0;
      const x = el ? el.scrollWidth - el.clientWidth : 0;
      const next = { vertical: y > threshold, horizontal: x > threshold,
        top: !el || el.scrollTop <= 2, bottom: !el || el.scrollTop >= y - 2,
        left: !el || el.scrollLeft <= 2, right: !el || el.scrollLeft >= x - 2 };
      setState(prev => Object.keys(next).every(key => prev[key as keyof typeof prev] === next[key as keyof typeof next]) ? prev : next);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const root = containerRef?.current ?? document.querySelector<HTMLElement>(selector);
    const activate = (event: Event) => {
      if (!followActive || !(event.target instanceof Element) || !root?.contains(event.target)) return;
      let node: HTMLElement | null = event.target as HTMLElement;
      activeRef.current = null;
      while (node && node !== root) {
        const css = getComputedStyle(node);
        if ((/(auto|scroll)/.test(css.overflowY) && node.scrollHeight > node.clientHeight + threshold) ||
            (/(auto|scroll)/.test(css.overflowX) && node.scrollWidth > node.clientWidth + threshold)) {
          activeRef.current = node;
          break;
        }
        node = node.parentElement;
      }
      schedule();
    };
    measure();
    document.addEventListener("scroll", schedule, true);
    root?.addEventListener("pointerover", activate);
    root?.addEventListener("focusin", activate);
    window.addEventListener("resize", schedule);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (root) resize?.observe(root);
    const mutation = new MutationObserver(schedule);
    if (root) mutation.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", schedule, true);
      root?.removeEventListener("pointerover", activate);
      root?.removeEventListener("focusin", activate);
      window.removeEventListener("resize", schedule);
      resize?.disconnect();
      mutation.disconnect();
    };
  }, [resolve, containerRef, selector, followActive, threshold]);

  const scroll = (direction: "top" | "bottom" | "left" | "right") => {
    const el = elRef.current ?? resolve();
    if (!el) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    if (direction === "top" || direction === "bottom") el.scrollTo({ top: direction === "top" ? 0 : el.scrollHeight, behavior });
    else el.scrollTo({ left: direction === "left" ? 0 : el.scrollWidth, behavior });
  };
  if (!state.vertical && !state.horizontal) return null;
  const controls = [
    { direction: "top" as const, show: state.vertical, disabled: state.top, Icon: ArrowUpToLine },
    { direction: "bottom" as const, show: state.vertical, disabled: state.bottom, Icon: ArrowDownToLine },
    { direction: "left" as const, show: state.horizontal, disabled: state.left, Icon: ArrowLeftToLine },
    { direction: "right" as const, show: state.horizontal, disabled: state.right, Icon: ArrowRightToLine },
  ];
  return <div role="group" aria-label={`${label} fast scrolling`} className={cn(
    "pointer-events-none z-40 flex gap-1.5 print:hidden",
    position === "fixed" ? "fixed bottom-24 right-4 flex-col lg:bottom-16" : position === "inline" ? "justify-end py-1" : "absolute bottom-3 right-3 flex-col", className,
  )}>
    {controls.filter(c => c.show).map(({ direction, disabled, Icon }) =>
      <Button key={direction} type="button" size="icon" variant="secondary" aria-label={`Scroll ${label} to ${direction}`} title={`Scroll to ${direction}`} disabled={disabled} onClick={() => scroll(direction)} className="pointer-events-auto h-9 w-9 shrink-0 border shadow-sm disabled:opacity-40">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </Button>)}
  </div>;
}
export default QuickScroll;
