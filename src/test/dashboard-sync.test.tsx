import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardSyncProvider } from "@/components/dashboard/DashboardSyncProvider";

const state = vi.hoisted(() => ({ callbacks: [] as (() => void)[], remove: vi.fn(), channel: vi.fn() }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "admin-1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  channel: state.channel, removeChannel: state.remove,
} }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); state.callbacks = []; });

describe("shared dashboard synchronization", () => {
  it("coalesces changes into one invalidation and removes the session channel", () => {
    vi.useFakeTimers();
    const channel = { on: vi.fn((_event, _filter, callback) => { state.callbacks.push(callback); return channel; }), subscribe: vi.fn(() => channel) };
    state.channel.mockReturnValue(channel);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const view = render(<QueryClientProvider client={client}><DashboardSyncProvider><div /></DashboardSyncProvider></QueryClientProvider>);
    expect(state.channel).toHaveBeenCalledTimes(1);
    act(() => { state.callbacks[0]?.(); state.callbacks[1]?.(); vi.advanceTimersByTime(350); });
    expect(invalidate).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(state.remove).toHaveBeenCalledWith(channel);
  });
  it("refreshes authorized reads when connectivity returns", () => {
    const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
    state.channel.mockReturnValue(channel);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    render(<QueryClientProvider client={client}><DashboardSyncProvider><div /></DashboardSyncProvider></QueryClientProvider>);
    act(() => window.dispatchEvent(new Event("online")));
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});