import { describe, it, expect, beforeEach, vi } from "vitest";

const inserted: any[][] = [];
const panics: any[] = [];
let failNext = false;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: (rows: any[]) => {
        if (failNext) return Promise.resolve({ error: { message: "offline" } });
        inserted.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
    rpc: (name: string, args: any) => {
      panics.push({ name, args });
      return Promise.resolve({ data: "alert-id", error: null });
    },
  },
}));

import { clearQueue, enqueuePosition, flushQueue, queueSize } from "./fleet-offline";

const fix = (over: Partial<Parameters<typeof enqueuePosition>[0]> = {}) => ({
  vehicle_id: "veh-1",
  lat: 5.7,
  lng: -0.3,
  speed_kph: 40,
  ...over,
});

describe("fleet offline store", () => {
  beforeEach(() => {
    clearQueue();
    inserted.length = 0;
    panics.length = 0;
    failNext = false;
  });

  it("persists fixes locally and flushes them in order", async () => {
    enqueuePosition(fix({ lat: 5.71 }) as any);
    enqueuePosition(fix({ lat: 5.72 }) as any);
    expect(queueSize()).toBe(2);

    const result = await flushQueue();
    expect(result.synced).toBe(2);
    expect(queueSize()).toBe(0);
    expect(inserted[0].map((r: any) => r.lat)).toEqual([5.71, 5.72]);
  });

  it("keeps fixes queued when the sync fails", async () => {
    enqueuePosition(fix() as any);
    failNext = true;
    const result = await flushQueue();
    expect(result.failed).toBe(1);
    expect(queueSize()).toBe(1);
  });

  it("raises queued panic presses once their position lands", async () => {
    enqueuePosition(fix({ panic: true, panic_note: "SOS offline" }) as any);
    await flushQueue();
    expect(panics).toHaveLength(1);
    expect(panics[0].name).toBe("fleet_raise_panic");
    expect(panics[0].args._note).toBe("SOS offline");
  });

  it("drops fixes that keep being rejected after repeated attempts", async () => {
    enqueuePosition(fix() as any);
    failNext = true;
    for (let i = 0; i < 5; i += 1) await flushQueue();
    expect(queueSize()).toBe(0);
  });
});
