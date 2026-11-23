import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RepeatingRows } from "@/components/staff/biodata/RepeatingRows";

describe("Staff/Employees education and employment dates", () => {
  it("shows full dates as DD/MM/YYYY while preserving year-only values and ISO edits", () => {
    const onChange = vi.fn();
    const { container } = render(<RepeatingRows
      idPrefix="period" columns={[{ key: "from_date", label: "From" }, { key: "to_date", label: "To" }]}
      rows={[{ from_date: "2006-09-14", to_date: "2010" }]} onChange={onChange}
    />);
    const inputs = container.querySelectorAll("input");
    expect(inputs[0].value).toBe("14/09/2006");
    expect(inputs[1].value).toBe("2010");
    expect(inputs[2].value).toBe("14/09/2006");
    fireEvent.change(inputs[0], { target: { value: "02/01/2011" } });
    expect(onChange).toHaveBeenLastCalledWith([{ from_date: "2011-01-02", to_date: "2010" }]);
  });
});