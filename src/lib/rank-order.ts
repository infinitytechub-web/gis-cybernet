/**
 * Rank ordering used everywhere ranks are listed.
 *
 * Order is top-to-bottom seniority: the configured `sort_order` first, then the
 * legacy numeric `level`, then the name. Categories (Senior Officers, Junior
 * Officers, Civilian Staff, …) carry their own order so lists can be grouped.
 */
export type RankLike = {
  id: string;
  name: string;
  abbreviation?: string | null;
  level?: number | null;
  sort_order?: number | null;
  category_id?: string | null;
};

export type RankCategoryLike = {
  id: string;
  name: string;
  sort_order?: number | null;
};

const orderValue = (r: RankLike) =>
  r.sort_order ?? r.level ?? Number.MAX_SAFE_INTEGER;

export function compareRanks(
  a: RankLike,
  b: RankLike,
  categoryOrder?: Map<string, number>,
) {
  if (categoryOrder) {
    const ca = categoryOrder.get(a.category_id ?? "") ?? Number.MAX_SAFE_INTEGER;
    const cb = categoryOrder.get(b.category_id ?? "") ?? Number.MAX_SAFE_INTEGER;
    if (ca !== cb) return ca - cb;
  }
  const oa = orderValue(a);
  const ob = orderValue(b);
  if (oa !== ob) return oa - ob;
  return a.name.localeCompare(b.name);
}

export function sortRanks<T extends RankLike>(
  ranks: T[],
  categories?: RankCategoryLike[],
): T[] {
  const categoryOrder = categories
    ? new Map(categories.map((c, i) => [c.id, c.sort_order ?? i]))
    : undefined;
  return [...ranks].sort((a, b) => compareRanks(a, b, categoryOrder));
}

/** Rank seniority for sorting staff rows top-to-bottom. */
export function rankSeniority(
  rank: RankLike | null | undefined,
  categoryOrder?: Map<string, number>,
) {
  if (!rank) return Number.MAX_SAFE_INTEGER;
  const cat = categoryOrder?.get(rank.category_id ?? "") ?? 0;
  return cat * 1000 + orderValue(rank);
}

export function groupRanksByCategory<T extends RankLike>(
  ranks: T[],
  categories: RankCategoryLike[],
): { category: RankCategoryLike | null; ranks: T[] }[] {
  const sortedCats = [...categories].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
  );
  const groups = sortedCats.map((category) => ({
    category: category as RankCategoryLike | null,
    ranks: sortRanks(ranks.filter((r) => r.category_id === category.id)),
  }));
  const uncategorised = sortRanks(ranks.filter((r) => !r.category_id));
  if (uncategorised.length) groups.push({ category: null, ranks: uncategorised });
  return groups.filter((g) => g.ranks.length > 0);
}
