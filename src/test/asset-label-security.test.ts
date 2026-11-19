// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { printAssetLabel } from "@/components/stores/AssetLabelPrint";
import { openPrintWindow } from "@/lib/safe-print";
import QRCode from "qrcode";

vi.mock("@/lib/safe-print", () => ({ openPrintWindow: vi.fn(() => ({})) }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async () => "data:image/png;base64,AAAA") } }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("asset label print safety", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders stored markup as text in the title, label and image attribute", async () => {
    const payload = '</title><script>alert(1)</script><img src=x onerror="alert(2)">\'&';
    await printAssetLabel({ asset_tag: payload, name: payload, category: payload, location: payload, serial_number: payload });
    const html = vi.mocked(openPrintWindow).mock.calls[0][0];
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelectorAll("script")).toHaveLength(0);
    expect(doc.querySelectorAll("img")).toHaveLength(1);
    expect(doc.querySelector("[onerror]")).toBeNull();
    expect(doc.title).toBe(`Asset label — ${payload}`);
    expect(doc.querySelector(".tag")?.textContent).toBe(payload);
    expect(doc.querySelector(".name")?.textContent).toBe(payload);
    expect(doc.querySelector("img")?.getAttribute("alt")).toBe(`QR ${payload}`);
    expect(QRCode.toDataURL).toHaveBeenCalledWith(payload, expect.any(Object));
  });

  it("keeps normal asset labels and QR images intact", async () => {
    await printAssetLabel({ asset_tag: "GIS-STORE-001", name: "Radio & charger" });
    const doc = new DOMParser().parseFromString(vi.mocked(openPrintWindow).mock.calls[0][0], "text/html");
    expect(doc.querySelector(".tag")?.textContent).toBe("GIS-STORE-001");
    expect(doc.querySelector(".name")?.textContent).toBe("Radio & charger");
    expect(doc.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });

  it("does not print an item without an asset tag", async () => {
    await printAssetLabel({ asset_tag: "", name: "Radio" });
    expect(openPrintWindow).not.toHaveBeenCalled();
  });
});