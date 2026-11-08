import type { Resident } from "@/lib/doorstep-data";
import { distanceMeters, type LatLng } from "./geo";
import type { NeedTag } from "./schemas";

/**
 * Resource matching. Shelter data comes from FEMA's National Shelter System when the server
 * can reach it (see fema.server.ts); otherwise these SYNTHETIC shelters are used and labeled.
 * Availability is never guaranteed: data can be stale or incomplete.
 */
export interface Shelter {
  id: string;
  name: string;
  location: LatLng;
  address: string;
  status: "open" | "closed" | "unknown";
  accessible: boolean | null;
  generator: boolean | null;
  pets: boolean | null;
  capacity: number | null;
  population: number | null;
  source: "FEMA NSS" | "Synthetic demo data";
  updatedAt: string | null;
}

export const SYNTHETIC_SHELTERS: Shelter[] = [
  {
    id: "syn-richardson-civic",
    name: "Richardson Civic Center (synthetic)",
    location: { lat: 32.9483, lng: -96.7299 },
    address: "411 W Arapaho Rd",
    status: "open",
    accessible: true,
    generator: true,
    pets: false,
    capacity: 250,
    population: 92,
    source: "Synthetic demo data",
    updatedAt: null,
  },
  {
    id: "syn-heights-rec",
    name: "Heights Recreation Center (synthetic)",
    location: { lat: 32.9595, lng: -96.7712 },
    address: "711 W Arapaho Rd",
    status: "open",
    accessible: true,
    generator: false,
    pets: true,
    capacity: 120,
    population: 41,
    source: "Synthetic demo data",
    updatedAt: null,
  },
  {
    id: "syn-utd-activity",
    name: "University Activity Center (synthetic)",
    location: { lat: 32.9857, lng: -96.7502 },
    address: "800 W Campbell Rd",
    status: "open",
    accessible: true,
    generator: true,
    pets: true,
    capacity: 400,
    population: 380,
    source: "Synthetic demo data",
    updatedAt: null,
  },
  {
    id: "syn-duck-creek-church",
    name: "Duck Creek Community Church (synthetic)",
    location: { lat: 32.9437, lng: -96.7108 },
    address: "Plano Rd",
    status: "open",
    accessible: false,
    generator: false,
    pets: false,
    capacity: 60,
    population: 18,
    source: "Synthetic demo data",
    updatedAt: null,
  },
];

export interface ResourceMatch {
  shelter: Shelter;
  distanceKm: number;
  score: number;
  reasons: string[];
  caveats: string[];
}

export function matchShelters(
  r: Resident,
  shelters: Shelter[],
  replyNeeds: NeedTag[] = [],
  limit = 3,
): ResourceMatch[] {
  const n = r.profile.needs;
  const needPower = Boolean(n.powerDependentEquipment) || replyNeeds.includes("power_medical");
  const needAccess =
    n.accessibleShelter ||
    n.mobility ||
    replyNeeds.includes("accessible_shelter") ||
    replyNeeds.includes("mobility");
  const needPets = n.pets;
  return shelters
    .filter((s) => s.status !== "closed")
    .map((s) => {
      const d = distanceMeters(r, s.location) / 1000;
      const reasons: string[] = [];
      const caveats: string[] = [];
      let score = 10 - Math.min(8, d);
      const check = (need: boolean, has: boolean | null, label: string, weight: number) => {
        if (!need) return;
        if (has === true) {
          score += weight;
          reasons.push(label);
        } else if (has === null) caveats.push(`${label}: not reported`);
        else score -= weight * 2;
      };
      check(needPower, s.generator, "Generator / backup power", 6);
      check(needAccess, s.accessible, "Accessible facility", 6);
      check(needPets, s.pets, "Accepts pets", 3);
      if (s.capacity !== null && s.population !== null) {
        const free = s.capacity - s.population;
        if (free <= 0) {
          score -= 20;
          caveats.push("Reported at capacity");
        } else if (free / s.capacity < 0.1) caveats.push(`Nearly full (${free} spaces reported)`);
        else reasons.push(`${free} spaces reported`);
      } else caveats.push("Capacity not reported");
      if (s.status === "unknown") caveats.push("Operating status unconfirmed");
      caveats.push(
        s.source === "FEMA NSS"
          ? `FEMA NSS data${s.updatedAt ? ` as of ${s.updatedAt}` : ""} — confirm before sending anyone`
          : "Synthetic demo shelter — not a real availability record",
      );
      return { shelter: s, distanceKm: Math.round(d * 10) / 10, score, reasons, caveats };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Other non-shelter resources suggested from needs. */
export function otherResources(r: Resident, replyNeeds: NeedTag[]): string[] {
  const out: string[] = [];
  if (r.profile.needs.powerDependentEquipment || replyNeeds.includes("power_medical"))
    out.push("Utility medical-priority line / equipment vendor backup-power guidance");
  if (r.profile.needs.transportation || replyNeeds.includes("transportation"))
    out.push("City paratransit / evacuation transport request (coordinator-approved)");
  if (replyNeeds.includes("information") || r.profile.notes?.includes("International"))
    out.push("Plain-language storm guide (multilingual) and 211 Texas information line");
  return out;
}
