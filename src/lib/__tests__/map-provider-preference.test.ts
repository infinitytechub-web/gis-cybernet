import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_FAILURE_TTL_MS,
  getProviderMode,
  googleRecentlyFailed,
  markGoogleFailed,
  setProviderMode,
  subscribeProviderPreference,
} from "../map-provider-preference";

describe("map provider preference", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("defaults to auto", () => {
    expect(getProviderMode()).toBe("auto");
  });

  it("persists a pinned provider and notifies subscribers", () => {
    const seen: string[] = [];
    const unsub = subscribeProviderPreference((p) => seen.push(p.mode));
    setProviderMode("osm");
    expect(getProviderMode()).toBe("osm");
    expect(seen).toEqual(["osm"]);
    expect(localStorage.getItem("cybernet.map.provider")).toContain("osm");
    unsub();
  });

  it("remembers a google failure within the TTL and forgets it after", () => {
    expect(googleRecentlyFailed()).toBe(false);
    markGoogleFailed();
    expect(googleRecentlyFailed()).toBe(true);

    const now = Date.now();
    const spy = vi.spyOn(Date, "now").mockReturnValue(now + GOOGLE_FAILURE_TTL_MS + 1000);
    expect(googleRecentlyFailed()).toBe(false);
    spy.mockRestore();
  });
});
