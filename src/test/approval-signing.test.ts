import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyAndSignApproval } from "@/lib/approval-signing";
const m = vi.hoisted(() => ({ getUser: vi.fn(), login: vi.fn(), rpc: vi.fn(), logout: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: m.getUser } } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ auth: { signInWithPassword: m.login, signOut: m.logout }, rpc: m.rpc }) }));
const args = { _workflow: "bail", _record_id: "case-1", _tier: 1, _decision: "recommend", _comments: "Reviewed" };
beforeEach(() => { vi.clearAllMocks(); m.getUser.mockResolvedValue({ data: { user: { id: "officer-1", email: "officer@example.test" } }, error: null }); m.login.mockResolvedValue({ data: { user: { id: "officer-1" }, session: {} }, error: null }); m.rpc.mockResolvedValue({ data: "signature-1", error: null }); m.logout.mockResolvedValue({ error: null }); });
describe("verified approval signatures", () => {
  it("signs using verified identity without supplying a typed name", async () => {
    expect(await verifyAndSignApproval("fictional-test-password", args)).toBe("signature-1");
    expect(m.rpc).toHaveBeenCalledWith("sign_approval", { ...args, _signer_name: "" });
    expect(m.logout).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not sign after failed password verification", async () => {
    m.login.mockResolvedValue({ error: { message: "Denied" }, data: {} });
    await expect(verifyAndSignApproval("invalid", args)).rejects.toThrow("Password verification failed");
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects a different verified account", async () => {
    m.login.mockResolvedValue({ error: null, data: { user: { id: "other" }, session: {} } });
    await expect(verifyAndSignApproval("invalid", args)).rejects.toThrow("Password verification failed");
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("surfaces server permission denial and clears the isolated session", async () => {
    m.rpc.mockResolvedValue({ error: { message: "Not authorised for this tier" } });
    await expect(verifyAndSignApproval("fictional-test-password", args)).rejects.toThrow("Not authorised for this tier");
    expect(m.logout).toHaveBeenCalled();
  });
});