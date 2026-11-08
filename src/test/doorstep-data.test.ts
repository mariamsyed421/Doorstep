import { describe, expect, it } from "vitest";
import {
  RESIDENTS,
  DISTRICTS,
  CITY_TOTAL,
  urgency,
  groupFor,
  districtCount,
  accountedFor,
  countySilentAtHome,
  texasAccountedFor,
  texasUnconfirmed,
  TEXAS_COUNTIES,
  TEXAS_TOTALS,
  COUNTIES_BY_PRIORITY,
  DEMO_COUNTY,
} from "@/lib/doorstep-data";
describe("Response priorities", () => {
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
  it("uses the live Elm count and static counts elsewhere", () => {
    const elm = DISTRICTS.find((d) => d.id === "elm")!;
    const canyon = DISTRICTS.find((d) => d.id === "canyon")!;
    expect(districtCount(elm, 7)).toBe(7);
    expect(districtCount(canyon, 7)).toBe(8);
    expect(accountedFor(0) + 32).toBe(12000);
    expect(accountedFor(5)).toBe(accountedFor(0) - 5);
  });
});
describe("Statewide mock data", () => {
  it("covers every Texas county exactly once with consistent figures", () => {
    expect(TEXAS_COUNTIES).toHaveLength(254);
    expect(new Set(TEXAS_COUNTIES.map((c) => c.geoid)).size).toBe(254);
    for (const c of TEXAS_COUNTIES) {
      expect(c.geoid).toMatch(/^48\d{3}$/);
      expect(c.silent).toBeLessThanOrEqual(c.enrolled);
      expect(c.silentAtHome).toBeLessThanOrEqual(c.silent);
      expect(c.liveAloneSilent).toBeLessThanOrEqual(c.silentAtHome);
    }
  });
  it("puts the Richardson demo county at the top and covers its neighborhoods", () => {
    expect(COUNTIES_BY_PRIORITY[0]?.geoid).toBe(DEMO_COUNTY);
    const richardson = DISTRICTS.reduce((n, d) => n + districtCount(d, 3), 0);
    expect(COUNTIES_BY_PRIORITY[0]!.silentAtHome).toBeGreaterThanOrEqual(richardson);
  });
  it("swaps Elm's static count for the live simulation count", () => {
    const dallas = TEXAS_COUNTIES.find((c) => c.geoid === DEMO_COUNTY)!;
    expect(countySilentAtHome(dallas, 3)).toBe(dallas.silentAtHome);
    expect(countySilentAtHome(dallas, 10)).toBe(dallas.silentAtHome + 7);
    expect(texasUnconfirmed(3)).toBe(TEXAS_TOTALS.silentAtHome);
    expect(texasAccountedFor(2)).toBe(texasAccountedFor(3) + 1);
  });
});
