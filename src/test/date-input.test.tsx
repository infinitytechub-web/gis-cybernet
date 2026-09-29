import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DateTimeInput } from "@/components/ui/date-time-input";

describe("day-first date entry", () => {
  it("accepts valid day-first input and stores ISO, but rejects invalid dates", () => {
    function Form() {
      const [value, setValue] = useState("");
      return <><DateInput aria-label="Date" value={value} onChange={(e) => setValue(e.target.value)} /><output>{value}</output></>;
    }
    render(<Form />);
    const input = screen.getByRole("textbox", { name: "Date" });
    fireEvent.change(input, { target: { value: "29092026" } });
    expect(input).toHaveProperty("value", "29/09/2026");
    expect(screen.getByText("2026-09-29")).toBeTruthy();
    fireEvent.change(input, { target: { value: "31022026" } });
    expect(screen.getByText("2026-09-29")).toBeTruthy();
    fireEvent.blur(input);
    expect(input).toHaveProperty("value", "29/09/2026");
  });

  it("combines a day-first date and 24-hour time into a local machine value", () => {
    function Form() {
      const [value, setValue] = useState("");
      return <><DateTimeInput value={value} onChange={(e) => setValue(e.target.value)} /><output>{value}</output></>;
    }
    render(<Form />);
    fireEvent.change(screen.getByPlaceholderText("DD/MM/YYYY"), { target: { value: "29092026" } });
    fireEvent.change(screen.getByLabelText("Time (24-hour)"), { target: { value: "14:30" } });
    expect(screen.getByText("2026-09-29T14:30")).toBeTruthy();
  });

  it("offers searchable year and selectable months for historic birth dates", () => {
    render(<DateInput value="1990-09-29" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Open calendar (DD/MM/YYYY)" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose month and year" }));
    expect(screen.getByRole("spinbutton", { name: "Search year" })).toHaveProperty("value", "1990");
    expect(screen.getByRole("button", { name: "Sep" })).toBeTruthy();
  });
});