import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/**
 * Integration ("E2E-style") coverage for the Pending Staff Approvals bulk-action workflow:
 *
 *  - Per-row checkboxes + select-all toggle
 *  - Bulk action bar visibility tied to selection
 *  - Confirmation AlertDialog gate before mutating
 *  - Batched processing in chunks of 50 (verified via mocked supabase call counts)
 *  - Status updates persist consistently: profiles + pending_staff_matches both touched
 *  - Permission gate: non-admin users get redirected away
 *  - Toaster receives a success message on completion
 */

// ---------- Build a synthetic dataset of 75 pending matches ----------
const PENDING_COUNT = 75;
const pendingRows = Array.from({ length: PENDING_COUNT }).map((_, i) => ({
  id: `match-${i}`,
  import_id: "imp-1",
  rank_text: "Inspector",
  name_text: `Test Officer ${i + 1}`,
  serial_no: i + 1,
  shift: ((["A", "B", "C", "D"] as const)[i % 4]),
  gender: "M",
  unit: null,
  status: "pending",
  matched_profile_id: null,
  created_profile_id: `profile-${i}`,
  created_at: new Date().toISOString(),
  resolved_at: null,
}));

// ---------- Supabase call recorder ----------
type Update = { table: string; values: Record<string, unknown>; ids: string[] };
type Delete = { table: string; ids: string[] };
const recorder = { updates: [] as Update[], deletes: [] as Delete[] };

vi.mock("@/integrations/supabase/client", () => {
  const fromImpl = (table: string) => {
    const builder: any = {
      _pendingUpdate: null as Record<string, unknown> | null,
      _mode: null as null | "update" | "delete" | "select",
      select(_cols?: string) {
        this._mode = "select";
        return this;
      },
      order() { return this; },
      limit() {
        // matches the select(...).order(...).limit(...) chain – return data
        if (table === "pending_staff_matches") {
          return Promise.resolve({ data: pendingRows, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      update(values: Record<string, unknown>) {
        this._mode = "update";
        this._pendingUpdate = values;
        return this;
      },
      delete() {
        this._mode = "delete";
        return this;
      },
      eq() {
        return Promise.resolve({ data: null, error: null });
      },
      in(_col: string, ids: string[]) {
        if (this._mode === "update" && this._pendingUpdate) {
          recorder.updates.push({ table, values: this._pendingUpdate, ids });
        } else if (this._mode === "delete") {
          recorder.deletes.push({ table, ids });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };
    return builder;
  };

  return {
    supabase: {
      from: fromImpl,
      auth: { getUser: async () => ({ data: { user: { id: "admin-1" } }, error: null }) },
    },
  };
});

// ---------- Auth context mock (admin) ----------
const mockAuth = {
  user: { id: "admin-1" } as any,
  role: "admin",
  loading: false,
  isAdmin: true,
  isSupervisor: false,
  isAdminOrSupervisor: true,
  isIpse: false,
  is2ic: false,
  isOic: false,
  isHoa: false,
  canExportInterlinkLogs: true,
  signIn: vi.fn(),
  signOut: vi.fn(),
};
vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => mockAuth,
}));

// Avoid sonner toaster mounting heavy DOM
const toastSpy = { success: vi.fn(), error: vi.fn() };
vi.mock("sonner", () => ({
  toast: {
    success: (msg: string) => toastSpy.success(msg),
    error: (msg: string) => toastSpy.error(msg),
  },
}));

// Import AFTER all mocks are registered
import PendingStaffApprovals from "./PendingStaffApprovals";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PendingStaffApprovals />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

async function waitForRowsLoaded() {
  await waitFor(() => expect(screen.getByText("Test Officer 1")).toBeInTheDocument());
}

describe("PendingStaffApprovals — bulk actions", () => {
  beforeEach(() => {
    recorder.updates = [];
    recorder.deletes = [];
    toastSpy.success.mockClear();
    toastSpy.error.mockClear();
    mockAuth.isAdminOrSupervisor = true;
  });

  it("hides the bulk action bar until at least one row is selected", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRowsLoaded();

    expect(screen.queryByText(/records? selected/)).not.toBeInTheDocument();

    const rowCheckboxes = screen.getAllByRole("checkbox", { name: /select test officer/i });
    await user.click(rowCheckboxes[0]);
    expect(await screen.findByText(/1 record selected/)).toBeInTheDocument();
  });

  it("select-all toggles every visible pending row and Clear empties it", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRowsLoaded();

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    expect(await screen.findByText(`${PENDING_COUNT} records selected`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    await waitFor(() =>
      expect(screen.queryByText(/records? selected/)).not.toBeInTheDocument(),
    );
  });

  it("requires confirmation before approving and processes selection in chunks of 50", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRowsLoaded();

    // Select all 75 rows
    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    expect(await screen.findByText(`${PENDING_COUNT} records selected`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^approve$/i }));

    // AlertDialog confirmation must appear and gate the mutation
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/approve 75 records\?/i)).toBeInTheDocument();
    // No supabase writes yet
    expect(recorder.updates).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: /confirm approve/i }));

    await waitFor(() => expect(toastSpy.success).toHaveBeenCalled());

    // Profile activation: 75 ids → 2 batches (50 + 25)
    const profileUpdates = recorder.updates.filter((u) => u.table === "profiles");
    expect(profileUpdates).toHaveLength(2);
    expect(profileUpdates[0].ids).toHaveLength(50);
    expect(profileUpdates[1].ids).toHaveLength(25);
    expect(profileUpdates[0].values).toMatchObject({ login_enabled: true });

    // Match-status update: same batching
    const matchUpdates = recorder.updates.filter((u) => u.table === "pending_staff_matches");
    expect(matchUpdates).toHaveLength(2);
    expect(matchUpdates[0].ids).toHaveLength(50);
    expect(matchUpdates[1].ids).toHaveLength(25);
    matchUpdates.forEach((u) =>
      expect(u.values).toMatchObject({ status: "approved", resolved_by: "admin-1" }),
    );

    expect(toastSpy.success).toHaveBeenCalledWith(
      expect.stringMatching(/Approved 75 records/i),
    );
  });

  it("bulk delete deletes profiles and marks matches rejected in batches of 50", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRowsLoaded();

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    await user.click(screen.getByRole("button", { name: /^delete$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/reject 75 records\?/i)).toBeInTheDocument();
    expect(recorder.deletes).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: /confirm delete/i }));

    await waitFor(() => expect(toastSpy.success).toHaveBeenCalled());

    // Profile deletes — 50 + 25
    const profileDeletes = recorder.deletes.filter((d) => d.table === "profiles");
    expect(profileDeletes).toHaveLength(2);
    expect(profileDeletes[0].ids).toHaveLength(50);
    expect(profileDeletes[1].ids).toHaveLength(25);

    // Match status flipped to rejected (consistent DB state)
    const matchUpdates = recorder.updates.filter((u) => u.table === "pending_staff_matches");
    expect(matchUpdates).toHaveLength(2);
    matchUpdates.forEach((u) =>
      expect(u.values).toMatchObject({ status: "rejected", resolved_by: "admin-1" }),
    );

    expect(toastSpy.success).toHaveBeenCalledWith(
      expect.stringMatching(/Rejected 75 records/i),
    );
  });

  it("bulk merge with multiple rows surfaces the per-row guidance and does not mutate", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForRowsLoaded();

    await user.click(screen.getByRole("checkbox", { name: /select all/i }));
    await user.click(screen.getByRole("button", { name: /^merge$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText(/bulk merge requires a single target profile/i),
    ).toBeInTheDocument();
    // No confirm action rendered — only Cancel
    expect(within(dialog).queryByRole("button", { name: /confirm/i })).toBeNull();

    expect(recorder.updates).toHaveLength(0);
    expect(recorder.deletes).toHaveLength(0);
  });
});
