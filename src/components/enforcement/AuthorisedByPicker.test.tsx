import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Mock the Supabase client used by AuthorisedByPicker ----
// The component runs two queries:
//   1) profiles (selected officer lookup, only when `value` is set)
//   2) user_roles → profiles (search list, when dialog is open)
// We return a deterministic list so we can assert keyboard behaviour.
const officers = [
  { id: "p1", first_name: "Ama",  last_name: "Mensah", ranks: { abbreviation: "ASP" }, departments: { name: "CYBER" } },
  { id: "p2", first_name: "Kofi", last_name: "Boateng", ranks: { abbreviation: "DSP" }, departments: { name: "MISD" } },
  { id: "p3", first_name: "Yaw",  last_name: "Owusu",   ranks: { abbreviation: "CI"  }, departments: { name: "OPS"  } },
];

// Each test can override what the search query returns.
type MockResult = { data: any[] | null; error: { message: string } | null };
const defaultResult: MockResult = {
  data: officers.map((p) => ({ role: "oic", user_id: `u-${p.id}`, profiles: p })),
  error: null,
};
const mockState: { searchResult: MockResult } = { searchResult: defaultResult };

vi.mock("@/integrations/supabase/client", () => {
  const fromImpl = (table: string) => {
    if (table === "user_roles") {
      const builder: any = {
        select: () => builder,
        in: () => builder,
        limit: () => builder,
        or: () => builder,
        then: (resolve: any) => resolve(mockState.searchResult),
      };
      return builder;
    }
    if (table === "profiles") {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: null, error: null }),
      };
      return builder;
    }
    return { select: () => ({ then: (r: any) => r({ data: [], error: null }) }) };
  };

  return { supabase: { from: fromImpl } };
});

// Import AFTER the mock is registered
import { AuthorisedByPicker } from "./AuthorisedByPicker";

const renderPicker = (onChange = vi.fn()) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AuthorisedByPicker value={null} onChange={onChange} />
    </QueryClientProvider>,
  );
  return { onChange };
};

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));
  // Wait for the search results to render
  await waitFor(() => expect(screen.getByText(/Ama Mensah/)).toBeInTheDocument());
};

describe("AuthorisedByPicker — keyboard navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.searchResult = defaultResult;
  });

  it("highlights the first option when the dialog opens", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openDialog(user);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
  });

  it("ArrowDown / ArrowUp move the highlight (with wraparound)", async () => {
    const user = userEvent.setup();
    renderPicker();
    await openDialog(user);

    await user.keyboard("{ArrowDown}");
    let options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");

    // Wraps from last back to first
    await user.keyboard("{ArrowDown}");
    options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // ArrowUp from first wraps to last
    await user.keyboard("{ArrowUp}");
    options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
  });

  it("Enter selects the highlighted officer and closes the dialog", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await openDialog(user);

    await user.keyboard("{ArrowDown}{Enter}"); // selects officer #2 (Kofi Boateng)

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("p2", expect.stringContaining("Kofi Boateng"));

    await waitFor(() => {
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });
  });

  it("Escape closes the dialog without selecting", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await openDialog(user);

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("option")).not.toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AuthorisedByPicker — empty results & errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.searchResult = defaultResult;
  });

  const openEmptyDialog = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));
    // Wait for the empty-state copy
    await waitFor(() =>
      expect(screen.getByText(/no matching oic \/ 2ic found/i)).toBeInTheDocument(),
    );
  };

  it("renders the empty-state when no officers are returned", async () => {
    mockState.searchResult = { data: [], error: null };
    const user = userEvent.setup();
    renderPicker();
    await openEmptyDialog(user);

    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("ignores ArrowDown / Enter when the result list is empty (no crash, no selection)", async () => {
    mockState.searchResult = { data: [], error: null };
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await openEmptyDialog(user);

    // These keystrokes should be safe no-ops
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}{Enter}");

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/no matching oic \/ 2ic found/i)).toBeInTheDocument();
  });

  it("Escape still closes the dialog when the list is empty", async () => {
    mockState.searchResult = { data: [], error: null };
    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await openEmptyDialog(user);

    await user.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByText(/no matching oic \/ 2ic found/i)).not.toBeInTheDocument(),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows an error state with a Retry button when the query fails, and keeps Arrow/Enter/Escape safe", async () => {
    mockState.searchResult = { data: null, error: { message: "boom" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't load officers/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);

    // Keyboard nav stays safe with no items
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).not.toHaveBeenCalled();

    // Escape still closes cleanly
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText(/couldn't load officers/i)).not.toBeInTheDocument(),
    );

    errSpy.mockRestore();
  });

  it("Retry recovers the list when the query starts succeeding", async () => {
    mockState.searchResult = { data: null, error: { message: "boom" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't load officers/i)).toBeInTheDocument(),
    );

    // Heal the data source, then click Retry
    mockState.searchResult = defaultResult;
    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(screen.getByText(/Ama Mensah/)).toBeInTheDocument());
    expect(screen.queryByText(/couldn't load officers/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);

    errSpy.mockRestore();
  });

  it("shows a distinct offline message with Try again, and keeps Arrow/Enter/Escape safe", async () => {
    // Force navigator.onLine = false BEFORE rendering so initial state picks it up
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    // The query may still resolve successfully — the offline branch is rendered
    // regardless of fetch state because connectivity is what we care about here.
    mockState.searchResult = { data: null, error: { message: "network down" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    const { onChange } = renderPicker();
    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));

    await waitFor(() =>
      expect(screen.getByText(/you appear to be offline/i)).toBeInTheDocument(),
    );
    // Distinct from the generic error copy
    expect(screen.queryByText(/couldn't load officers/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);

    // Keyboard nav stays safe with no items
    await user.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(onChange).not.toHaveBeenCalled();

    // Escape still closes cleanly
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByText(/you appear to be offline/i)).not.toBeInTheDocument(),
    );

    onlineSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe("AuthorisedByPicker — accessibility announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.searchResult = defaultResult;
  });

  it("announces the error state assertively with a distinct Retry label", async () => {
    mockState.searchResult = { data: null, error: { message: "boom" } };
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("aria-atomic", "true");
    expect(alert).toHaveTextContent(/couldn't load officers/i);

    // Distinct, descriptive button label (not just the visible "Retry" text)
    expect(
      screen.getByRole("button", { name: /retry loading officers/i }),
    ).toBeInTheDocument();

    errSpy.mockRestore();
  });

  it("announces the offline state politely with a distinct Try-again label", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    mockState.searchResult = { data: [], error: null };

    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-atomic", "true");
    expect(status).toHaveTextContent(/you appear to be offline/i);

    expect(
      screen.getByRole("button", { name: /try again to load officers \(offline\)/i }),
    ).toBeInTheDocument();

    onlineSpy.mockRestore();
  });

  it("the listbox carries an aria-label and toggles aria-busy while fetching", async () => {
    const user = userEvent.setup();
    renderPicker();
    await user.click(screen.getByRole("button", { name: /select oic \/ 2ic/i }));

    const listbox = await screen.findByRole("listbox");
    expect(listbox).toHaveAttribute("aria-label", "OIC and 2IC officers");
    // After data has loaded, aria-busy should settle to "false"
    await waitFor(() => expect(listbox).toHaveAttribute("aria-busy", "false"));
  });
});
