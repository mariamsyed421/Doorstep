import { describe, expect, it } from "vitest";
import {
  RESIDENTS,
  DISTRICTS,
  CITY_TOTAL,
  urgency,
  groupFor,
  districtCount,
  accountedFor,
} from "@/lib/doorstep-data";

describe("Synthetic residents and districts", () => {
  it("uses the brief's neighborhood urgency thresholds", () => {
    expect([0, 1, 3, 4, 8, 9].map(urgency)).toEqual([
      "quiet",
      "amber",
      "amber",
      "orange",
      "orange",
      "red",
    ]);
  });
  it("has 40 synthetic households with unique ids and 12,000 residents across 9 districts", () => {
    expect(RESIDENTS).toHaveLength(40);
    expect(new Set(RESIDENTS.map((r) => r.id)).size).toBe(40);
    expect(DISTRICTS).toHaveLength(9);
    expect(CITY_TOTAL).toBe(12000);
  });
  it("uses only synthetic 555-01xx phone numbers", () => {
    for (const r of RESIDENTS) expect(r.profile.phone).toMatch(/^555-01\d{2}$/);
  });
  it("derives declared functional needs from the preparedness profile", () => {
    const omar = RESIDENTS.find((r) => r.id === "406");
    const elena = RESIDENTS.find((r) => r.id === "412");
    const walsh = RESIDENTS.find((r) => r.id === "433");
    expect(omar?.profile.needs.powerDependentEquipment).toBe("Home oxygen concentrator");
    expect(omar?.profile.needs.criticalMedical).toBe(true);
    expect(elena?.profile.needs.mobility).toBe(true);
    expect(walsh?.profile.consent.contactEmergencyContact).toBe(false);
  });
  it("groups residents by plan", () => {
    const by = (id: string) => RESIDENTS.find((r) => r.id === id)!;
    expect(groupFor(by("412"))).toBe("check");
    expect(groupFor(by("427"))).toBe("call");
    expect(groupFor(by("433"))).toBe("unknown");
  });
  it("counts Elm live and other districts from static demo data", () => {
    const elm = DISTRICTS.find((d) => d.id === "elm")!;
    const canyon = DISTRICTS.find((d) => d.id === "canyon")!;
    expect(districtCount(elm, 7)).toBe(7);
    expect(districtCount(canyon, 7)).toBe(8);
    expect(accountedFor(0) + 32).toBe(12000);
    expect(accountedFor(5)).toBe(accountedFor(0) - 5);
  });
});
