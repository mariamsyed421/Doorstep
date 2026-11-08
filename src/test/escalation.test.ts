import { describe, expect, it } from "vitest";
import { RESIDENTS } from "@/lib/doorstep-data";
import {
  DEFAULT_CONFIG,
  allowed,
  approve,
  onResponse,
  start,
  tick,
} from "@/lib/doorstep/escalation";

const by = (id: string) => RESIDENTS.find((r) => r.id === id)!;

describe("Escalation state machine", () => {
  it("walks text → follow-up → voice, then waits for coordinator approval", () => {
    const r = by("412");
    let { state, actions } = start(r, 0);
    expect(actions.map((a) => a.type)).toEqual(["send"]);
    expect(state.stage).toBe(0);
    ({ state, actions } = tick(state, r, 30));
    expect(actions).toEqual([]);
    ({ state, actions } = tick(state, r, 60));
    expect(state.stage).toBe(1);
    ({ state, actions } = tick(state, r, 120));
    expect(actions[0]?.type).toBe("call");
    ({ state, actions } = tick(state, r, 180));
    expect(state.status).toBe("awaiting_approval");
    expect(state.pendingStage).toBe(3);
    expect(actions[0]?.type).toBe("approval_requested");
    // No automatic third-party outreach no matter how long we wait.
    const later = tick(state, r, 10_000);
    expect(later.actions).toEqual([]);
    expect(later.state.stage).toBe(2);
  });

  it("never duplicates an action for the same stage", () => {
    const r = by("412");
    let { state } = start(r, 0);
    const again = tick(state, r, 0);
    expect(again.actions).toEqual([]);
    state = approve(state, r, 4, "coord", 10).state;
    const dup = approve(state, r, 4, "coord", 11);
    expect(dup.actions).toEqual([]);
    expect(dup.state.attempts.filter((a) => a.stage === 4)).toHaveLength(1);
  });

  it("stops silence escalation on a confirmed response", () => {
    const r = by("412");
    const { state } = start(r, 0);
    const resolved = onResponse(state, "safe", 20);
    expect(resolved.status).toBe("resolved");
    expect(tick(resolved, r, 500).actions).toEqual([]);
  });

  it("routes assistance requests to human review", () => {
    const r = by("441");
    const { state } = start(r, 0);
    const s = onResponse(state, "needs_assistance", 20);
    expect(s.status).toBe("human_review");
    expect(tick(s, r, 500).actions).toEqual([]);
  });

  it("respects consent: skips stages the resident did not allow", () => {
    const wei = by("439"); // no voice-call consent
    expect(allowed(wei, 2)).toBe(false);
    let { state } = start(wei, 0);
    state = tick(state, wei, 60).state;
    const r = tick(state, wei, 120);
    expect(r.actions[0]?.type).toBe("approval_requested");
    expect(r.state.pendingStage).toBe(3);

    const walsh = by("433"); // no emergency contact on file
    expect(allowed(walsh, 3)).toBe(false);
    expect(approve(start(walsh, 0).state, walsh, 3, "coord", 5).actions).toEqual([]);
  });

  it("stage 5 approval flags welfare-check review as terminal", () => {
    const r = by("433");
    const out = approve(start(r, 0).state, r, 5, "coord", 5);
    expect(out.state.status).toBe("welfare_review");
    expect(out.state.approvals[0]?.by).toBe("coord");
  });

  it("supports configurable wait intervals", () => {
    const r = by("412");
    const cfg = { waitMinutes: { ...DEFAULT_CONFIG.waitMinutes, 0: 15 } };
    const { state } = start(r, 0, cfg);
    expect(tick(state, r, 15, cfg).state.stage).toBe(1);
  });
});
