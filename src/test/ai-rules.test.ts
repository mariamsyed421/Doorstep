import { describe, expect, it } from "vitest";
import { classifyWithRules, checkInTemplate } from "@/lib/doorstep/ai/rules";
import { ClassificationResultSchema } from "@/lib/doorstep/schemas";
import { RESIDENTS } from "@/lib/doorstep-data";
import { matchShelters, SYNTHETIC_SHELTERS } from "@/lib/doorstep/resources";

describe("Deterministic AI fallback", () => {
  it("classifies the oxygen example as urgent with the power-medical factor", () => {
    const c = classifyWithRules("My power is out and my oxygen machine needs electricity.");
    expect(c.category).toBe("urgent_assistance");
    expect(c.urgency).toBe("urgent");
    expect(c.needs).toContain("power_medical");
    expect(ClassificationResultSchema.parse(c)).toBeTruthy();
  });
  it("interprets Spanish requests", () => {
    const c = classifyWithRules(
      "Se fue la luz y no tengo carro. Necesito transporte al refugio, por favor.",
      "Spanish",
    );
    expect(c.category).toBe("needs_assistance");
    expect(c.detectedLanguage).toBe("Spanish");
    expect(c.needs).toContain("transportation");
  });
  it("handles numeric and multilingual safe replies", () => {
    expect(classifyWithRules("1").category).toBe("safe");
    expect(classifyWithRules("1 Estamos bien").category).toBe("safe");
    expect(classifyWithRules("1 بخير").detectedLanguage).toBe("Arabic");
  });
  it("does not treat 'look' as 'ok'", () => {
    expect(classifyWithRules("can someone look at this").category).not.toBe("safe");
  });
  it("flags unclear replies as uncertain", () => {
    const c = classifyWithRules("hmm");
    expect(c.category).toBe("unclear");
    expect(c.uncertain).toBe(true);
  });
  it("has check-in templates in every resident language", () => {
    for (const r of RESIDENTS) expect(checkInTemplate(r, 0).length).toBeGreaterThan(10);
  });
});

describe("Resource matching", () => {
  it("prefers generator shelters for power-dependent residents and labels synthetic data", () => {
    const omar = RESIDENTS.find((r) => r.id === "406")!;
    const [best] = matchShelters(omar, SYNTHETIC_SHELTERS);
    expect(best?.shelter.generator).toBe(true);
    expect(best?.caveats.join(" ")).toMatch(/Synthetic/);
  });
  it("prefers accessible shelters for an accessible-shelter request", () => {
    const ray = RESIDENTS.find((r) => r.id === "443")!;
    for (const m of matchShelters(ray, SYNTHETIC_SHELTERS, ["accessible_shelter"], 2))
      expect(m.shelter.accessible).toBe(true);
  });
  it("down-ranks shelters reported at capacity", () => {
    const r = RESIDENTS[0]!;
    const full = { ...SYNTHETIC_SHELTERS[0]!, id: "full", population: 999 };
    const ranked = matchShelters(r, [full, ...SYNTHETIC_SHELTERS.slice(1)], [], 5);
    expect(ranked.at(-1)?.shelter.id).toBe("full");
  });
});
