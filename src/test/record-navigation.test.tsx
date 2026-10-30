import { act, render, renderHook, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePagedList } from "@/hooks/usePagedList";
import { QuickScroll } from "@/components/ui/quick-scroll";
import { createRef } from "react";

describe("record page limits", () => {
  it("keeps record pages at 25 even when a caller requests a larger page", () => {
    const items = Array.from({ length: 61 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagedList(items, { pageSize: 100 }));
    expect(result.current.pageItems).toEqual(items.slice(0, 25));
    expect(result.current.totalPages).toBe(3);
    act(() => result.current.setPage(2));
    expect(result.current.pageItems).toEqual(items.slice(25, 50));
    act(() => result.current.setPage(3));
    expect(result.current.pageItems).toEqual(items.slice(50));
    expect(result.current.total).toBe(61);
  });
  it("returns to the first page when filters change", async () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    const { result, rerender } = renderHook(({ key, data }) => usePagedList(data, { resetKey: key }), { initialProps: { key: "all", data: items } });
    act(() => result.current.setPage(3));
    rerender({ key: "filtered", data: items.slice(0, 30) });
    await waitFor(() => expect(result.current.page).toBe(1));
    expect(result.current.pageItems.length).toBe(25);
    expect(result.current.total).toBe(30);
  });
});

describe("fast scrolling", () => {
  it("moves a record container to each edge without changing the other axis", async () => {
    const el = document.createElement("div");
    Object.defineProperties(el, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 }, scrollWidth: { value: 900 }, clientWidth: { value: 300 } });
    el.scrollTop = 100;
    el.scrollLeft = 100;
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo;
    const ref = createRef<HTMLElement>();
    Object.defineProperty(ref, "current", { value: el });
    const ui = render(<QuickScroll containerRef={ref} label="records" />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Scroll records to bottom" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Scroll records to bottom" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: "smooth" });
    fireEvent.click(screen.getByRole("button", { name: "Scroll records to top" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: "smooth" });
    fireEvent.click(screen.getByRole("button", { name: "Scroll records to right" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 900, behavior: "smooth" });
    fireEvent.click(screen.getByRole("button", { name: "Scroll records to left" }));
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: "smooth" });
    ui.unmount();
  });
});