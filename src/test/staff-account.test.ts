import { describe, expect, it } from "vitest";
import { buildProfilePayload, validateStaffAccountForm, type StaffAccountForm } from "@/lib/staff-account";
import { DEFAULT_PASSWORD_POLICY } from "@/lib/password-policy";

const valid: StaffAccountForm = {
  staffId: "GIS-00999",
  firstName: "Ama",
  lastName: "Mensah",
  gender: "Female",
  phone: "",
  ghanaCard: "",
  orgUnitId: "unit-1",
  role: "staff",
  password: "Str0ng!Passw0rd",
};

describe("validateStaffAccountForm", () => {
  it("accepts a complete valid form", () => {
    expect(validateStaffAccountForm(valid, DEFAULT_PASSWORD_POLICY)).toBeNull();
  });

  it.each([
    ["staffId", "Staff ID is required"],
    ["firstName", "First name is required"],
    ["lastName", "Last name is required"],
    ["password", "Set a temporary password for the new account"],
  ] as const)("requires %s", (field, message) => {
    expect(validateStaffAccountForm({ ...valid, [field]: "" }, DEFAULT_PASSWORD_POLICY)).toBe(message);
  });

  it("requires a command and a role", () => {
    expect(validateStaffAccountForm({ ...valid, orgUnitId: "" }, DEFAULT_PASSWORD_POLICY))
      .toBe("Select the Command / Unit this staff member is posted to");
    expect(validateStaffAccountForm({ ...valid, role: "" }, DEFAULT_PASSWORD_POLICY))
      .toBe("Select a designated role");
  });

  it("rejects a malformed Ghana Card", () => {
    expect(validateStaffAccountForm({ ...valid, ghanaCard: "GHA-123" }, DEFAULT_PASSWORD_POLICY))
      .toBe("Ghana Card must be in the format GHA-XXXXXXXXX-X");
  });

  it("rejects a password that fails the active policy", () => {
    const err = validateStaffAccountForm({ ...valid, password: "short" }, DEFAULT_PASSWORD_POLICY);
    expect(err).toMatch(/^Password does not meet the policy:/);
  });
});

describe("buildProfilePayload", () => {
  it("mirrors the Staff page insert shape and trims values", () => {
    const payload = buildProfilePayload(
      { ...valid, staffId: " GIS-00999 ", firstName: " Ama " },
      { rankId: "r1", departmentId: "d1", unit: " Cyber ", phoneLocal: "0241234567" },
    );
    expect(payload).toEqual({
      staff_id: "GIS-00999",
      first_name: "Ama",
      last_name: "Mensah",
      gender: "Female",
      phone: "0241234567",
      unit: "Cyber",
      rank_id: "r1",
      department_id: "d1",
      org_unit_id: "unit-1",
      status: "active",
      ghana_card_number: null,
    });
  });

  it("nulls out empty optional fields", () => {
    const payload = buildProfilePayload({ ...valid, gender: "" }, {});
    expect(payload.gender).toBeNull();
    expect(payload.unit).toBeNull();
    expect(payload.rank_id).toBeNull();
    expect(payload.department_id).toBeNull();
    expect(payload.phone).toBeNull();
  });
});
