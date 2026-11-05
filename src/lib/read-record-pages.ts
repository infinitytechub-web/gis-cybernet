/** Read every caller-authorized page, without treating a failed read as an empty list. */
export async function readRecordPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await read(from, from + size - 1);
    if (error) throw error;
    if (!data) throw new Error("Records unavailable. Please retry.");
    rows.push(...data);
    if (data.length < size) return rows;
  }
}