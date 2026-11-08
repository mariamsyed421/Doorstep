import { describe, expect, it } from "vitest";
import { RESIDENTS, type Resident } from "@/lib/doorstep-data";
import { classifyWithRules } from "@/lib/doorstep/ai/rules";
import { SIMULATED_OUTAGE_FEED, type OutageEvent } from "@/lib/doorstep/outages";
import { DEFAULT_WEIGHTS, EMPTY_SIGNALS, assess, levelForScore } from "@/lib/doorstep/scoring";

const by = (id: string) => RESIDENTS.find((r) => r.id === id)!;
const outages: OutageEvent[] = SIMULATED_OUTAGE_FEED.map((o) => ({
  ...o,
  startedAt: 60,
  active: true,
}));
const silent = (sentAt: number, failed = 0) => ({
  ...EMPTY_SIGNALS,
  checkInSentAt: sentAt,
  failedDeliveries: failed,
});

describe("Signal Fusion scoring", () => {
  it("reproduces the Maria Johnson example: 17, HIGH", () => {
    const a = assess(by("449"), silent(5, 2), outages, 185);
    expect(a.score).toBe(17);
    expect(a.level).toBe("high");
    const ids = a.factors.map((f) => f.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "powerDependentInOutage",
        "noConfirmedResponse",
        "perAdditionalSilentHour",
        "multipleFailedDeliveries",
        "outageOverlap",
        "plannedToRemain",
      ]),
    );
    expect(a.recommendedAction).toMatch(/alternate outreach/i);
    expect(a.evidence).toContain("Simulated Ting outage feed");
    expect(a.confidence).toBe("medium");
  });

  it("is deterministic", () => {
    expect(assess(by("449"), silent(5, 2), outages, 185)).toEqual(
      assess(by("449"), silent(5, 2), outages, 185),
    );
  });

  it("caps additional silent hours at +6", () => {
    const a = assess(by("435"), silent(0), [], 60 * 30);
    expect(a.factors.find((f) => f.id === "perAdditionalSilentHour")?.points).toBe(
      DEFAULT_WEIGHTS.silentHoursCap,
    );
  });

  it("does not score silence before a check-in was sent", () => {
    const a = assess(by("435"), EMPTY_SIGNALS, [], 600);
    expect(a.factors.some((f) => f.id === "noConfirmedResponse")).toBe(false);
  });

  it("never uses age, language or insurance as evidence of danger", () => {
    const base = by("400");
    const twin: Resident = {
      ...base,
      id: "999",
      age: 95,
      language: "Arabic",
      profile: { ...base.profile, insurance: null },
    };
    const x = assess(base, silent(0), [], 120);
    const y = assess(twin, silent(0), [], 120);
    expect(y.score).toBe(x.score);
    expect(y.factors.map((f) => f.label).join(" ")).not.toMatch(/age|language|insur/i);
  });

  it("silence alone stays low priority", () => {
    const priya = by("435");
    const plain: Resident = { ...priya, livesAlone: false, planAnswer: "family" };
    const a = assess(plain, silent(0), [], 90);
    expect(a.level).toBe("low");
  });

  it("an explicit urgent request forces urgent review regardless of score", () => {
    const c = classifyWithRules("My power is out and my oxygen machine needs electricity.");
    const a = assess(
      by("400"),
      { ...EMPTY_SIGNALS, checkInSentAt: 5, repliedAt: 10, latestReply: c },
      [],
      10,
    );
    expect(a.score).toBeLessThan(10);
    expect(a.level).toBe("urgent");
    expect(a.override).toBe(true);
    expect(a.humanReview).toBe(true);
  });

  it("a confirmed safe reply resolves the case and removes silence factors", () => {
    const c = classifyWithRules("1");
    const a = assess(
      by("412"),
      { ...EMPTY_SIGNALS, checkInSentAt: 5, repliedAt: 30, latestReply: c },
      outages,
      185,
    );
    expect(a.level).toBe("resolved");
    expect(a.factors.some((f) => f.id === "noConfirmedResponse")).toBe(false);
  });

  it("neighbor confirmation resolves with high confidence", () => {
    const a = assess(by("412"), { ...silent(5), confirmedBy: "neighbor" }, outages, 200);
    expect(a.level).toBe("resolved");
    expect(a.confidence).toBe("high");
  });

  it("outage events raise scores for overlapping residents", () => {
    const before = assess(by("412"), silent(5), [], 185);
    const after = assess(by("412"), silent(5), outages, 185);
    expect(after.score - before.score).toBe(DEFAULT_WEIGHTS.outageOverlap);
  });

  it("maps scores to levels", () => {
    expect([0, 6, 12, 20].map(levelForScore)).toEqual(["low", "medium", "high", "urgent"]);
  });

  it("supports configurable weights", () => {
    const a = assess(by("449"), silent(5, 2), outages, 185, {
      ...DEFAULT_WEIGHTS,
      outageOverlap: 0,
    });
    expect(a.score).toBe(14);
  });
});
