// Outbound email recipient policy.
// Client-initiated sends may only reach addresses that belong to a registered
// staff record (profiles.email) or to an explicitly admin/command-managed
// allow-list table. Arbitrary external addresses are rejected server-side.
// deno-lint-ignore-file no-explicit-any

export async function partitionRecipients(
  adminClient: any,
  emails: string[],
  opts: { extraTable?: string } = {},
): Promise<{ allowed: string[]; rejected: string[] }> {
  const uniq = Array.from(new Set(emails.map((e) => e.trim()).filter(Boolean)));
  if (uniq.length === 0) return { allowed: [], rejected: [] };
  const lookup = Array.from(new Set([...uniq, ...uniq.map((e) => e.toLowerCase())]));

  const known = new Set<string>();
  const { data: prof } = await adminClient
    .from("profiles").select("email").in("email", lookup);
  for (const r of prof ?? []) if (r?.email) known.add(String(r.email).toLowerCase());

  if (opts.extraTable) {
    const { data: extra } = await adminClient
      .from(opts.extraTable).select("email").in("email", lookup);
    for (const r of extra ?? []) if (r?.email) known.add(String(r.email).toLowerCase());
  }

  const allowed: string[] = [];
  const rejected: string[] = [];
  for (const e of uniq) (known.has(e.toLowerCase()) ? allowed : rejected).push(e);
  return { allowed, rejected };
}

/** Mask an email for diagnostics: "jo***@ex***.com". Never log raw addresses. */
export function maskEmail(e: string | null | undefined): string {
  if (!e) return "";
  const [u, d = ""] = String(e).split("@");
  const [dn, ...tld] = d.split(".");
  return `${u.slice(0, 2)}***@${(dn ?? "").slice(0, 2)}***${tld.length ? "." + tld.join(".") : ""}`;
}
