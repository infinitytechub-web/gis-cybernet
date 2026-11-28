import { describe, expect, it } from "vitest";
import { exportAccessAllowed, parseExportPath } from "../../supabase/functions/gps-cloud-export/access";

const owner = "00000000-0000-0000-0000-000000000001";
const unit = "00000000-0000-0000-0000-000000000002";
const expires = 1800000000000;
const path = `gps-auth-exports/${owner}/${unit}/${expires}/${owner}_gps.csv`;

describe("GPS downloads require current permission", () => {
  it("allows an authorized command head in scope", () => expect(exportAccessAllowed(["oic"], true)).toBe(true));
  it("denies a removed command role even with a copied link", () => expect(exportAccessAllowed(["staff"], true)).toBe(false));
  it("denies missing roles", () => expect(exportAccessAllowed([], true)).toBe(false));
  it("denies a different command", () => expect(exportAccessAllowed(["2ic"], false)).toBe(false));
  it("requires both creator and recipient to retain access", () => {
    const canDownload = (creator: string[], recipient: string[]) => exportAccessAllowed(creator, true) && exportAccessAllowed(recipient, true);
    expect(canDownload(["oic"], ["2ic"])).toBe(true);
    expect(canDownload([], ["2ic"])).toBe(false);
    expect(canDownload(["oic"], [])).toBe(false);
  });
  it("reads expiry from the stored object name", () => expect(parseExportPath(path, expires - 1)?.expiresAt).toBe(expires));
  it("blocks expired links at the expiry boundary", () => expect(parseExportPath(path, expires)).toBeNull());
  it("rejects legacy public link paths and other files", () => {
    expect(parseExportPath(`gps-exports/${owner}/gps.csv`, 0)).toBeNull();
    expect(parseExportPath(`other/${owner}/${unit}/${expires}/${owner}_gps.csv`, 0)).toBeNull();
    expect(parseExportPath(path.replace("gps.csv", "../secret.csv"), 0)).toBeNull();
  });
});