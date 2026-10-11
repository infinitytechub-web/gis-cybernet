import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// ── Mock backend: attendance rows + realtime channel registry ────────────────
const state = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as any,
  channels: [] as { name: string; handler?: () => void }[],
  removed: 0,
}));

vi.mock("@/integrations/supabase/client", () => {
  const chain: any = {
    select: () => chain, eq: () => chain,
    limit: () => Promise.resolve({ data: state.error ? null : state.rows, error: state.error }),
  };
  return {
    supabase: {
      from: () => chain,
      channel: (name: string) => {
        const ch: any = { name };
        ch.on = (_e: string, _f: unknown, h: () => void) => { ch.handler = h; return ch; };
        ch.subscribe = () => ch;
        state.channels.push(ch);
        return ch;
      },
      removeChannel: () => { state.removed += 1; },
    },
  };
});

import { normalizeStaffName, staffNameKey, dedupeStaffRows } from "@/lib/staff-name";
import { dutyStateOf, DutyStatusBadge } from "@/components/shared/DutyStatusBadge";
import { useTodayDuty, dutyFor, DUTY_LABEL } from "@/hooks/useTodayDuty";

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  state.rows = []; state.error = null; state.channels = []; state.removed = 0;
});

describe("uppercase name normalization", () => {
  it("uppercases, trims and collapses spaces", () => {
    expect(normalizeStaffName("  kwame   asante ")).toBe("KWAME ASANTE");
    expect(normalizeStaffName("Ama")).toBe("AMA");
    expect(normalizeStaffName("   ")).toBeNull();
    expect(normalizeStaffName(null)).toBeNull();
  });
  it("is idempotent for already-uppercase names", () => {
    expect(normalizeStaffName("KOFI MENSAH")).toBe("KOFI MENSAH");
  });
});

describe("duplicate prevention", () => {
  it("treats case/spacing variants as the same person", () => {
    expect(staffNameKey("kofi", "mensah")).toBe(staffNameKey(" KOFI ", "Mensah"));
  });
  it("dedupes by staff ID and keeps IDs unchanged", () => {
    const out = dedupeStaffRows([
      { staff_id: "GIS-001", first_name: "ama", last_name: "boateng" },
      { staff_id: "gis-001", first_name: "AMA", last_name: "BOATENG" },
      { staff_id: "GIS-002", first_name: "yaw", last_name: "ofori" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ staff_id: "GIS-001", first_name: "AMA", last_name: "BOATENG" });
  });
  it("dedupes by name when no staff ID", () => {
    expect(dedupeStaffRows([{ first_name: "esi", last_name: "addo" }, { first_name: "ESI ", last_name: "ADDO" }])).toHaveLength(1);
  });
});

describe("duty status detection", () => {
  it("green on duty when clocked in or present/late", () => {
    expect(dutyStateOf("present", null)).toBe("on_duty");
    expect(dutyStateOf("late", null)).toBe("on_duty");
    expect(dutyStateOf(null, "2026-10-11T07:00:00Z")).toBe("on_duty");
  });
  it("amber when excused, even with no clock-in", () => {
    expect(dutyStateOf("excused", null)).toBe("excused");
  });
  it("red when scheduled and no clock-in or permission", () => {
    expect(dutyStateOf(null, null, true)).toBe("absent");
    expect(dutyStateOf("absent", null, false)).toBe("absent");
  });
  it("not marked when not known to be scheduled", () => {
    expect(dutyStateOf(null, null, false)).toBe("pending");
  });
  it("badge shows text + accessible label, not colour alone", () => {
    render(<DutyStatusBadge state="absent" />);
    expect(screen.getByText("Absent")).toBeInTheDocument();
    expect(screen.getByLabelText("Duty status: Absent")).toBeInTheDocument();
  });
});

describe("status synchronization", () => {
  it("maps today's attendance per profile for directory/analytics/exports", async () => {
    state.rows = [
      { profile_id: "p1", status: "present", check_in: "x" },
      { profile_id: "p2", status: "excused", check_in: null },
      { profile_id: "p3", status: "absent", check_in: null },
    ];
    const { result } = renderHook(() => useTodayDuty(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    const m = result.current.data;
    expect(DUTY_LABEL[dutyFor(m, "p1")]).toBe("On duty");
    expect(DUTY_LABEL[dutyFor(m, "p2")]).toBe("Excused");
    expect(DUTY_LABEL[dutyFor(m, "p3")]).toBe("Absent");
    expect(DUTY_LABEL[dutyFor(m, "unknown")]).toBe("Not marked");
  });

  it("shares one realtime channel and refreshes on attendance change", async () => {
    const W = wrapper();
    const a = renderHook(() => useTodayDuty(), { wrapper: W });
    const b = renderHook(() => useTodayDuty(), { wrapper: W });
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    expect(state.channels).toHaveLength(1);

    state.rows = [{ profile_id: "p9", status: "present", check_in: "x" }];
    await act(async () => { state.channels[0].handler?.(); });
    await waitFor(() => expect(dutyFor(a.result.current.data, "p9")).toBe("on_duty"));

    a.unmount();
    expect(state.removed).toBe(0);
    b.unmount();
    expect(state.removed).toBe(1);
  });
});

describe("permission handling", () => {
  it("a denied attendance read shows Not marked instead of crashing or claiming absence", async () => {
    state.error = { code: "42501", message: "permission denied" };
    const { result } = renderHook(() => useTodayDuty(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(dutyFor(result.current.data, "p1")).toBe("pending");
  });
});
