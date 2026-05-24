import { useCallback, useMemo, useState } from "react";

/**
 * Reusable multi-selection hook for tables/lists.
 * Tracks a Set of selected ids and provides helpers for row checkboxes
 * and "select all visible" header toggles.
 */
export function useBulkSelection<T extends { id: string }>(visibleRows: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visibleIds = useMemo(() => visibleRows.map((r) => r.id), [visibleRows]);

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    !allVisibleSelected && visibleIds.some((id) => selected.has(id));

  const toggleAllVisible = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
      if (allOn) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    selectedIds: Array.from(selected),
    count: selected.size,
    isSelected,
    toggle,
    allVisibleSelected,
    someVisibleSelected,
    toggleAllVisible,
    clear,
  };
}
