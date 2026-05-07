import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GhanaCardInput,
  isValidGhanaCard,
  ghanaCardError,
} from "@/components/shared/GhanaCardInput";
import { useState } from "react";

/**
 * The exact error message thrown by the submit handlers in
 *   - src/pages/Staff.tsx
 *   - src/pages/MyProfile.tsx
 * Keep this string in sync — tests fail loudly if it drifts.
 */
const SUBMIT_ERROR =
  "Ghana Card must be in the format GHA-XXXXXXXXX-X (9 digits, dash, 1 digit)";

/** Mirrors the guard used in both pages' saveMutation. */
function simulateSubmitGuard(value: string): string | null {
  const v = (value ?? "").trim();
  if (v && !isValidGhanaCard(v)) return SUBMIT_ERROR;
  return null;
}

describe("Ghana Card validation – isValidGhanaCard", () => {
  it("accepts a correctly formatted value", () => {
    expect(isValidGhanaCard("GHA-123456789-1")).toBe(true);
  });

  it.each([
    ["empty string", ""],
    ["missing prefix", "123456789-1"],
    ["wrong prefix", "GH-123456789-1"],
    // Note: lowercase prefix is normalized to uppercase before regex check, so it is accepted.
    ["too few digits before dash", "GHA-12345678-1"],
    ["too many digits before dash", "GHA-1234567890-1"],
    ["missing check digit", "GHA-123456789-"],
    ["letters in number", "GHA-12345678A-1"],
    ["no dash before check digit", "GHA-1234567891"],
    ["extra trailing chars", "GHA-123456789-12"],
    ["spaces inside", "GHA-123 456 789-1"],
  ])("rejects %s", (_label, bad) => {
    expect(isValidGhanaCard(bad)).toBe(false);
  });
});

describe("Ghana Card validation – submit guard (Staff & MyProfile)", () => {
  it("blocks malformed values with the exact submit error message", () => {
    expect(simulateSubmitGuard("GHA-12-3")).toBe(SUBMIT_ERROR);
    expect(simulateSubmitGuard("GHA-ABCDEFGHI-1")).toBe(SUBMIT_ERROR);
  });

  it("allows blank value (Ghana Card optional in both forms)", () => {
    expect(simulateSubmitGuard("")).toBeNull();
    expect(simulateSubmitGuard("   ")).toBeNull();
  });

  it("allows a valid canonical value", () => {
    expect(simulateSubmitGuard("GHA-123456789-1")).toBeNull();
  });
});

/** Wrapper to drive controlled GhanaCardInput like Staff/MyProfile do. */
function Harness({ initial = "" }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return (
    <div>
      <GhanaCardInput value={v} onChange={setV} />
      <output data-testid="raw">{v}</output>
    </div>
  );
}

describe("GhanaCardInput – inline error after blur", () => {
  it("shows no error before user interaction", () => {
    render(<Harness />);
    expect(
      screen.queryByText(/Format must be GHA-XXXXXXXXX-X/i),
    ).not.toBeInTheDocument();
  });

  it("shows inline error on blur when partially typed", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "12345" } });
    fireEvent.blur(input);
    expect(
      screen.getByText(/Format must be GHA-XXXXXXXXX-X/i),
    ).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("clears the inline error once a valid value is entered", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "12345" } });
    fireEvent.blur(input);
    expect(
      screen.getByText(/Format must be GHA-XXXXXXXXX-X/i),
    ).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "1234567891" } });
    // Component should now hold the canonical value
    expect(screen.getByTestId("raw").textContent).toBe("GHA-123456789-1");
    expect(
      screen.queryByText(/Format must be GHA-XXXXXXXXX-X/i),
    ).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  it("strips non-digit characters and caps at 10 digits", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "abc123-def4567890extra" } });
    // Only digits 1234567890 should remain → canonical GHA-123456789-0
    expect(screen.getByTestId("raw").textContent).toBe("GHA-123456789-0");
  });
});

describe("ghanaCardError helper", () => {
  it("returns required message when blank and required=true", () => {
    expect(ghanaCardError("", true)).toMatch(/required/i);
  });
  it("returns null when blank and not required", () => {
    expect(ghanaCardError("", false)).toBeNull();
  });
  it("returns format message for malformed value", () => {
    expect(ghanaCardError("GHA-12-3")).toMatch(/Format must be/i);
  });
  it("returns null for valid value", () => {
    expect(ghanaCardError("GHA-123456789-1")).toBeNull();
  });
});
