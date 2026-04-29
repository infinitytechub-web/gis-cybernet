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

vi.mock("@/integrations/supabase/client", () => {
  const buildSearchResult = () => ({
    data: officers.map((p) => ({ role: "oic", user_id: `u-${p.id}`, profiles: p })),
    error: null,
  });

  const fromImpl = (table: string) => {
    if (table === "user_roles") {
      const builder: any = {
        select: () => builder,
        in: () => builder,
        limit: () => builder,
        or: () => builder,
        // Awaiting the builder resolves to the result
        then: (resolve: any) => resolve(buildSearchResult()),
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
  beforeEach(() => vi.clearAllMocks());

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
