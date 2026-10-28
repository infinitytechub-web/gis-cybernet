import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { CommandOperationsRedirect } from "@/components/CommandOperationsRedirect";
import { canAccessModule } from "@/lib/rbac";

afterEach(cleanup);
function Destination() { const location = useLocation(); return <p data-testid="destination">{location.pathname}{location.search}{location.hash}</p>; }
describe("unified command operations", () => {
  it.each(["enforcement", "operations", "holding"] as const)("redirects %s while preserving record context", (tab) => {
    render(<MemoryRouter initialEntries={[`/${tab}?record=case-1#details`]}><Routes>
      <Route path={`/${tab}`} element={<CommandOperationsRedirect tab={tab} />} />
      <Route path="/command-operations" element={<Destination />} />
    </Routes></MemoryRouter>);
    expect(screen.getByTestId("destination").textContent).toBe(`/command-operations?record=case-1&tab=${tab}#details`);
  });
  it.each(["enforcement", "operations", "detention"])("allows hub access with only the %s grant without granting siblings", (capability) => {
    const input = { role: "staff_officer" as const, capabilities: [capability] };
    expect(canAccessModule("command-operations", input)).toBe(true);
    for (const module of ["enforcement", "operations", "detention"]) expect(canAccessModule(module, input)).toBe(module === capability);
  });
  it("denies hub access to unassigned staff officers and ordinary staff", () => {
    expect(canAccessModule("command-operations", { role: "staff_officer" })).toBe(false);
    expect(canAccessModule("command-operations", { role: "staff" })).toBe(false);
  });
});