import { describe, it, expect } from "vitest";
import { buildVaultLogCsv, vaultActionLabel } from "@/lib/vault-log";

describe("vault log", () => {
  it("labels a preview as Viewed", () => { expect(vaultActionLabel("preview")).toBe("Viewed"); });
  it("writes day-first date and time with the officer", () => {
    const csv = buildVaultLogCsv([{ id: "1", created_at: new Date(2026, 10, 8, 9, 5, 7).toISOString(), action: "download", file_id: "f", file_title: "Staff list", file_name: "a.pdf", detail: null, actor_user_id: "u", actor_name: "KOFI MENSAH", actor_staff_id: "GIS-1", actor_rank: "Inspector" }]);
    expect(csv.split("\n")[1]).toBe("08/11/2026,09:05:07,Downloaded,Staff list,a.pdf,KOFI MENSAH,Inspector,GIS-1,");
  });
});
