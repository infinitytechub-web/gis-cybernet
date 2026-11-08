import { describe, it, expect } from "vitest";
import { filterQuickUsers, maskQuickId } from "./quick-user-search";
const rows = [{ id: "1", first_name: "GRACE", last_name: "ABANKWA", staff_id: "GIS-ASC-0008", unit: "Amasaman", rank_name: "Inspector", rank_abbreviation: "INSP", photo_url: null }];
describe("quick user search", () => {
  it("matches names ignoring case and spacing", () => expect(filterQuickUsers(rows, "  grace   abankwa ")).toHaveLength(1));
  it("needs at least two characters", () => expect(filterQuickUsers(rows, "g")).toHaveLength(0));
  it("masks IDs for non-privileged viewers", () => expect(maskQuickId("GIS-ASC-0008", false)).toBe("GIS•••••••08"));
  it("shows full IDs to privileged viewers", () => expect(maskQuickId("GIS-ASC-0008", true)).toBe("GIS-ASC-0008"));
});
