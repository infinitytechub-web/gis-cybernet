import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AgeDisplay, DobLabelWithAge } from "@/components/ui/age-display";
import { DATE_FORMAT_HINT } from "@/lib/date-format";

describe("AgeDisplay", () => {
  it("prompts when no DoB is entered", () => {
    render(<AgeDisplay dob="" />);
    expect(screen.getByText(/Age auto-calculates from DoB/i)).toBeInTheDocument();
  });

  it("shows the calculated age as soon as a DoB is present", () => {
    const dob = new Date(new Date().getFullYear() - 30, 0, 1).toISOString().slice(0, 10);
    render(<AgeDisplay dob={dob} />);
    expect(screen.getByText(/Age: (29|30) yrs/)).toBeInTheDocument();
  });

  it("rejects future dates of birth", () => {
    const dob = new Date(new Date().getFullYear() + 2, 0, 1).toISOString().slice(0, 10);
    render(<AgeDisplay dob={dob} />);
    expect(screen.getByText(/cannot be in the future/i)).toBeInTheDocument();
  });

  it("flags invalid dates of birth", () => {
    render(<AgeDisplay dob="31/31/1990" />);
    expect(screen.getByText(/valid date of birth/i)).toBeInTheDocument();
  });

  it("labels DoB fields with the DD/MM/YYYY hint", () => {
    render(<DobLabelWithAge dob={null} label={`Date of Birth (${DATE_FORMAT_HINT})`} />);
    expect(screen.getByText("Date of Birth (DD/MM/YYYY)")).toBeInTheDocument();
  });
});
