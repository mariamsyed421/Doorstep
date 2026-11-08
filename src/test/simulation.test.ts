import { describe, expect, it } from "vitest";
import { RESIDENTS } from "@/lib/doorstep-data";
import {
  assessAll,
  initialState,
  markerFor,
  seededState,
  simReducer,
  SEED_MINUTE,
} from "@/lib/doorstep/simulation";

describe("Demo simulation", () => {
  it("starts before the incident with nobody contacted", () => {
    const s = initialState();
    expect(s.incident.status).toBe("pending");
    expect(s.messages).toHaveLength(0);
    const a = assessAll(s);
    expect(RESIDENTS.every((r) => markerFor(r, s, a[r.id]) === "unknown")).toBe(true);
  });

  it("is repeatable: two seeded runs are identical", () => {
    expect(seededState()).toEqual(seededState());
  });

  it("runs the scripted events in order", () => {
    const s = seededState();
    const kinds = s.logs.map((l) => l.kind);
    expect(kinds[0]).toBe("incident");
    expect(kinds.indexOf("outage")).toBeGreaterThan(kinds.indexOf("outreach"));
    expect(kinds).toContain("fusion");
    expect(s.logs.some((l) => /overlap a simulated outage zone/.test(l.text))).toBe(true);
    expect(s.now).toBe(SEED_MINUTE);
  });

  it("produces the expected scenario states at T+3h", () => {
    const s = seededState();
    const a = assessAll(s);
    const m = (id: string) =>
      markerFor(
        RESIDENTS.find((r) => r.id === id)!,
        s,
        a[id],
      );
    expect(m("400")).toBe("safe"); // confirmed safe by text
    expect(m("406")).toBe("danger"); // oxygen + outage, explicit urgent request
    expect(a["406"]?.override).toBe(true);
    expect(m("441")).toBe("help"); // Spanish transportation request
    expect(s.signals["441"]?.latestReply?.detectedLanguage).toBe("Spanish");
    expect(s.signals["439"]?.latestReply?.category).toBe("info_request"); // international student
    expect(m("445")).toBe("safe"); // safe + insurance guidance
    expect(s.signals["445"]?.latestReply?.needs).toContain("insurance_guidance");
    expect(m("447")).toBe("away"); // evacuated before the incident
    expect(m("443")).toBe("help"); // accessible shelter
    expect(a["449"]?.score).toBe(17); // Maria Johnson
    expect(s.signals["451"]?.failedDeliveries).toBeGreaterThanOrEqual(2); // comms failure pocket
    expect(s.escalations["412"]?.status).toBe("awaiting_approval");
  });

  it("coordinator-approved neighbor confirmation resolves a resident", () => {
    let s = seededState();
    s = simReducer(s, { type: "approve", residentId: "412", stage: 4, by: "coord" });
    s = simReducer(s, {
      type: "confirm",
      residentId: "412",
      by: "neighbor",
      outcome: "safe",
      text: "She's okay",
    });
    const a = assessAll(s);
    expect(a["412"]?.level).toBe("resolved");
    expect(s.escalations["412"]?.status).toBe("resolved");
    // Further time never re-escalates.
    s = simReducer(s, { type: "advance", minutes: 300 });
    expect(s.escalations["412"]?.status).toBe("resolved");
  });

  it("re-classifies with an AI result without duplicating messages", () => {
    let s = seededState();
    const id = s.enrich[0]!;
    const msg = s.messages.find((m) => m.id === id)!;
    const c = { ...msg.classification!, provider: "nemotron" as const, uncertain: false };
    s = simReducer(s, { type: "enriched", messageId: id, classification: c });
    expect(s.enrich).not.toContain(id);
    expect(s.messages.filter((m) => m.id === id)).toHaveLength(1);
  });

  it("advance_to_next jumps to the next due event", () => {
    const s = simReducer(initialState(), { type: "advance_to_next" });
    expect(s.now).toBe(0);
    expect(s.incident.status).toBe("active");
  });
});
