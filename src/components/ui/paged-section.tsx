import { ListPagination } from "@/components/ui/list-pagination";
import { usePagedList } from "@/hooks/usePagedList";
import { ReactNode, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Wraps any list/table with type-to-search and 25-per-page pagination.
 * `children` receives only the current page's items.
 */
export function PagedSection<T>({
  items, searchText, children, label = "rows", placeholder = "Type to search…", hideSearch,
}: {
  items: T[];
  searchText?: (item: T) => string;
  children: (pageItems: T[]) => ReactNode;
  label?: string;
  placeholder?: string;
  hideSearch?: boolean;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !searchText) return items;
    return items.filter((i) => searchText(i).toLowerCase().includes(s));
  }, [items, q, searchText]);
  const pager = usePagedList(filtered, { resetKey: q });
  const showSearch = !hideSearch && searchText && items.length > 10;
  return (
    <div className="space-y-2">
      {showSearch && (
        <div className="relative max-w-xs">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="pl-8 h-9" aria-label={placeholder} />
        </div>
      )}
      {children(pager.pageItems)}
      <ListPagination {...pager} label={label} />
    </div>
  );
}
