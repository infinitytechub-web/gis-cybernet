/**
 * QUICK SCROLL — floating "scroll to top / bottom" controls for long pages and
 * long in-dialog lists.
 *
 * The controls only appear once the scrollable area is meaningfully longer than
 * one viewport, and they never swallow pointer events over page content: the
 * wrapper is `pointer-events-none` and only the buttons themselves are
 * clickable. Works with the page scroller (`#main-content` in the app shell)
 * or with any scroll container passed via `containerRef`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpToLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function QuickScroll({
  containerRef,
  selector = "#main-content",
  className,
  label = "page",
  threshold = 400,
  position = "absolute",
}: {
  /** Explicit scroll container (e.g. a dialog list). Takes precedence. */
  containerRef?: React.RefObject<HTMLElement>;
  /** CSS selector for the scroll container when no ref is supplied. */
  selector?: string;
  className?: string;
  /** Used in the accessible button names, e.g. "staff list". */
  label?: string;
  /** Extra pixels of overflow required before the controls appear. */
  threshold?: number;
  /** `fixed` for page-level controls, `absolute` inside a positioned list. */
  position?: "absolute" | "fixed";
}) {
  const [visible, setVisible] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const elRef = useRef<HTMLElement | null>(null);

  const resolve = useCallback((): HTMLElement | null => {
    if (containerRef?.current) return containerRef.current;
    return (document.querySelector(selector) as HTMLElement | null) ?? null;
  }, [containerRef, selector]);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      const el = resolve();
      elRef.current = el;
      if (!el) {
        setVisible(false);
        return;
      }
      const overflow = el.scrollHeight - el.clientHeight;
      setVisible(overflow > threshold);
      setAtTop(el.scrollTop <= 24);
      setAtBottom(el.scrollTop >= overflow - 24);
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    const el = resolve();
    el?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onScroll) : null;
    if (el && observer) observer.observe(el);
    // Content can grow after data loads — re-measure shortly after mount.
    const timer = window.setTimeout(measure, 600);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      el?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      observer?.disconnect();
    };
  }, [resolve, threshold]);

  const scrollTo = (where: "top" | "bottom") => {
    const el = elRef.current ?? resolve();
    if (!el) return;
    el.scrollTo({ top: where === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
  };

  if (!visible) return null;

  return (
    <div
      aria-hidden={false}
      className={cn(
        "pointer-events-none z-40 flex flex-col gap-1.5",
        position === "fixed" ? "fixed bottom-24 right-4 lg:bottom-16" : "absolute bottom-3 right-3",
        className,
      )}
    >
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label={`Scroll ${label} to top`}
        title="Scroll to top"
        disabled={atTop}
        onClick={() => scrollTo("top")}
        className="pointer-events-auto h-9 w-9 rounded-full border shadow-md transition-opacity disabled:opacity-40"
      >
        <ArrowUpToLine className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label={`Scroll ${label} to bottom`}
        title="Scroll to bottom"
        disabled={atBottom}
        onClick={() => scrollTo("bottom")}
        className="pointer-events-auto h-9 w-9 rounded-full border shadow-md transition-opacity disabled:opacity-40"
      >
        <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export default QuickScroll;
