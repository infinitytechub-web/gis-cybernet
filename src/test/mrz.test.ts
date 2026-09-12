import { describe, expect, it } from "vitest";
import { mrzCheckDigit, parseMrz } from "@/lib/mrz";

// ICAO 9303 specimen passport (TD3).
const TD3 = [
  "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<",
  "L898902C36UTO7408122F1204159ZE184226B<<<<<10",
].join("\n");

describe("MRZ reader", () => {
  it("computes ICAO check digits", () => {
    expect(mrzCheckDigit("L898902C3")).toBe(6);
    expect(mrzCheckDigit("740812")).toBe(2);
  });

  it("reads a passport MRZ and validates it", () => {
    const r = parseMrz(TD3);
    expect(r).not.toBeNull();
    expect(r!.format).toBe("TD3");
    expect(r!.surname).toBe("ERIKSSON");
    expect(r!.givenNames).toBe("ANNA MARIA");
    expect(r!.documentNumber).toBe("L898902C3");
    expect(r!.sex).toBe("Female");
    expect(r!.dateOfBirth).toBe("1974-08-12");
    expect(r!.expiryDate).toBe("2012-04-15");
    expect(r!.checksumValid).toBe(true);
  });

  it("flags a tampered MRZ", () => {
    const tampered = TD3.replace("7408122", "7408123");
    expect(parseMrz(tampered)!.checksumValid).toBe(false);
  });

  it("returns nothing for text that is not an MRZ", () => {
    expect(parseMrz("hello world")).toBeNull();
  });
});
