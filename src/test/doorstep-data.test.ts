import { describe, expect, it } from "vitest";
import {
  RESIDENTS,
  DISTRICTS,
  urgency,
  groupFor,
  districtCount,
  markerState,
  accountedFor,
  unconfirmed,
  TEXAS_COUNTIES,
  TEXAS_TOTALS,
  COUNTIES_BY_PRIORITY,
  DEMO_COUNTY,
} from "@/lib/doorstep-data";
const baseline = TEXAS_TOTALS.enrolled - TEXAS_TOTALS.silentAtHome;
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
  it("has 30 households and 12,000 residents across 9 districts", () => {
    expect(RESIDENTS).toHaveLength(30);
    expect(DISTRICTS).toHaveLength(9);
    expect(DISTRICTS.reduce((n, d) => n + d.totalResidents, 0)).toBe(12000);
  });
  it("prioritizes silent home residents and calls contacts for away residents", () => {
    const lopez = RESIDENTS.find((r) => r.id === "412");
    const tran = RESIDENTS.find((r) => r.id === "427");
    const walsh = RESIDENTS.find((r) => r.id === "433");
    if (!lopez || !tran || !walsh) throw Error("Missing demo people");
    expect(groupFor(lopez)).toBe("check");
    expect(groupFor(tran)).toBe("call");
    expect(groupFor(walsh)).toBe("unknown");
    expect(markerState(tran, {})).toBe("away");
  });
  it("a safe neighbor reply removes danger and increments the live counter", () => {
    const r = RESIDENTS.find((r) => r.id === "412");
    const elm = DISTRICTS.find((d) => d.id === "elm");
    if (!r || !elm) throw Error("Missing Elm demo");
    expect(districtCount(elm, {})).toBe(3);
    expect(markerState(r, {})).toBe("danger");
    expect(markerState(r, { "412": "safe" })).toBe("safe");
    expect(districtCount(elm, { "412": "safe" })).toBe(2);
    expect(accountedFor({})).toBe(baseline);
    expect(accountedFor({ "412": "safe" })).toBe(baseline + 1);
    expect(unconfirmed({ "412": "safe" })).toBe(TEXAS_TOTALS.silentAtHome - 1);
  });
  it("dispatching a welfare check does not falsely count a person safe", () => {
    expect(accountedFor({ "433": "helpOnWay" })).toBe(baseline);
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
    const richardson = DISTRICTS.reduce((n, d) => n + districtCount(d, {}), 0);
    expect(COUNTIES_BY_PRIORITY[0]!.silentAtHome).toBeGreaterThanOrEqual(richardson);
  });
});
