import { useEffect, useMemo, useRef, useState } from "react";

/** System-wide default: lists longer than this paginate automatically. */
export const DEFAULT_PAGE_SIZE = 25;

/**
 * Client-side pagination for already-authorized, already-filtered lists.
 * Resets to page 1 whenever the `resetKey` (e.g. search/filter state) or the
 * list length changes, so filters never leave the user on an empty page.
 */
export function usePagedList<T>(items: T[], opts: { pageSize?: number; resetKey?: unknown } = {}) {
  const pageSize = DEFAULT_PAGE_SIZE;
  // Retain the shared API for existing callers; record pages remain fixed at 25.
  const setPageSize = (_size: number) => setPage(1);
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetRef = useRef(opts.resetKey);
  useEffect(() => {
    if (!Object.is(resetRef.current, opts.resetKey)) {
      resetRef.current = opts.resetKey;
      setPage(1);
    } else if (page > totalPages) setPage(totalPages);
  }, [opts.resetKey, page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return {
    page, setPage, pageSize, setPageSize, total, totalPages, pageItems,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

export type PagedList<T> = ReturnType<typeof usePagedList<T>>;
