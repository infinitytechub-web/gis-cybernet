import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Award } from "lucide-react";
import { PageHeader } from "./PageHeader";

describe("PageHeader spacing", () => {
  it("does NOT render a subtitle paragraph when subtitle is omitted", () => {
    const { container } = render(<PageHeader icon={Award} title="Dashboard" />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });

  it("does NOT render a subtitle paragraph when subtitle is empty/whitespace", () => {
    const { container } = render(
      <PageHeader icon={Award} title="Dashboard" subtitle="   " />,
    );
    expect(container.querySelectorAll("p").length).toBe(0);
  });

  it("renders subtitle paragraph when provided", () => {
    const { container, getByText } = render(
      <PageHeader icon={Award} title="Dashboard" subtitle="Overview of metrics" />,
    );
    expect(container.querySelectorAll("p").length).toBe(1);
    expect(getByText("Overview of metrics")).toBeInTheDocument();
  });

});
