import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  handlers: [] as (() => void)[],
  removed: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: state.rpc,
  channel: () => {
    const channel = {
      on: (_event: string, _filter: unknown, callback: () => void) => { state.handlers.push(callback); return channel; },
      subscribe: () => channel,
    };
    return channel;
  },
  removeChannel: state.removed,
} }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
import { useRosterClock } from "@/hooks/useRosterClock";
import { useAttendanceReportSync, ATTENDANCE_REPORT_KEYS } from "@/hooks/useAttendanceReportSync";
import { canAccessPath } from "@/lib/rbac";

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, invalidate, wrapper };
}
beforeEach(() => { vi.clearAllMocks(); state.handlers = []; });

describe("shift roster integration", () => {
  it("allows officers their roster without granting Attendance Overview access", () => {
    expect(canAccessPath("/shift-roster", { role: "staff" })).toBe(true);
    expect(canAccessPath("/attendance/overview", { role: "staff" })).toBe(false);
    expect(canAccessPath("/shift-roster", { role: null })).toBe(false);
  });
  it.each(["check_in", "check_out"] as const)("records %s with server timestamps and refreshes reports", async (action) => {
    const recorded = { attendance_id: "a1", action, status: "late", check_in: "2026-10-28T08:20:00Z", check_out: action === "check_out" ? "2026-10-28T16:00:00Z" : null, severity: "late" };
    state.rpc.mockResolvedValue({ data: recorded, error: null });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRosterClock(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ profileId: "self-profile", action }); });
    expect(state.rpc).toHaveBeenCalledWith("roster_clock_action", {
      _profile_id: "self-profile", _action: action, _notes: null, _reason: null, _photo_path: null,
    });
    await waitFor(() => expect(result.current.data).toEqual(recorded));
    ATTENDANCE_REPORT_KEYS.forEach((key) => expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] }));
  });
  it("keeps duplicate rejection as an error without refreshing successful attendance", async () => {
    state.rpc.mockResolvedValue({ data: null, error: new Error("Already clocked in today") });
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(() => useRosterClock(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ profileId: "self-profile", action: "check_in" })).rejects.toThrow("Already clocked in today");
    });
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("keeps denied attendance writes blocked", async () => {
    state.rpc.mockResolvedValue({ data: null, error: new Error("Not authorised") });
    const { wrapper } = setup();
    const { result } = renderHook(() => useRosterClock(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ profileId: "other-profile", action: "check_out" })).rejects.toThrow("Not authorised");
    });
    expect(result.current.data).toBeUndefined();
  });
  it("refreshes Attendance Overview after remote clock events and removes its subscription", () => {
    const { wrapper, invalidate } = setup();
    const hook = renderHook(() => useAttendanceReportSync(), { wrapper });
    act(() => state.handlers[0]?.());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["attendance-hours-summary"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["attendance_validation"] });
    hook.unmount();
    expect(state.removed).toHaveBeenCalledOnce();
  });
});