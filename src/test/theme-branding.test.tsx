import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ThemeProvider, useTheme } from "next-themes";
import { brandToCssVars, contrastRatio, contrastFor } from "@/lib/brands";

const brand = { primary: "152 65% 22%", secondary: "43 74% 45%", accent: "155 55% 45%", background: "150 30% 97%", surface: "0 0% 100%", text: "155 45% 10%", border: "150 25% 85%", success: "145 60% 32%", warning: "40 90% 45%", danger: "0 75% 45%" };
afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.className = ""; });

describe("official theme readability", () => {
  for (const mode of ["light", "dark"] as const) {
    it(`${mode} maintains AA contrast for text, actions and feedback`, () => {
      const vars = brandToCssVars(brand, mode);
      for (const role of ["primary", "secondary", "card", "popover", "muted", "accent", "success", "warning", "destructive"]) {
        expect(contrastRatio(vars[`--${role}`], vars[`--${role}-foreground`])).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(vars["--background"], vars["--foreground"])).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(vars["--input"], vars["--card"])).toBeGreaterThanOrEqual(3);
    });
  }
  it("chooses dark text for Gold instead of unreadable white", () => {
    expect(contrastFor(brand.secondary)).toBe("155 45% 10%");
  });
  it("dark mode does not inherit saved white card surfaces", () => {
    const vars = brandToCssVars(brand, "dark");
    expect(vars["--card"]).toBe("160 10% 12%");
    expect(vars["--background"]).toBe("160 12% 8%");
  });
});

function Workflow() {
  const { setTheme, theme } = useTheme();
  return <><input aria-label="Draft" defaultValue="" /><button onClick={() => setTheme("dark")}>Dark</button><button onClick={() => setTheme("light")}>Light</button><output>{theme}</output></>;
}
it("switching themes preserves input and persists the preference without remounting", async () => {
  render(<ThemeProvider attribute="class" defaultTheme="system" enableSystem><Workflow /></ThemeProvider>);
  fireEvent.change(screen.getByLabelText("Draft"), { target: { value: "Unsaved staff entry" } });
  fireEvent.click(screen.getByText("Dark"));
  await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
  expect(localStorage.getItem("theme")).toBe("dark");
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("Unsaved staff entry");
  fireEvent.click(screen.getByText("Light"));
  await waitFor(() => expect(document.documentElement.classList.contains("light")).toBe(true));
  expect(localStorage.getItem("theme")).toBe("light");
  expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("Unsaved staff entry");
});