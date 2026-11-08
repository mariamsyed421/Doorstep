import { distanceMeters, type LatLng } from "./geo";

/**
 * SIMULATED Ting-style outage intelligence.
 *
 * Ting sensors detect grid outages at the household level. Doorstep is NOT connected to live
 * Ting infrastructure; every event here is synthetic and labeled `simulated: true`.
 */
export type OutageType = "power" | "communications";

export interface OutageEvent {
  id: string;
  type: OutageType;
  source: string;
  simulated: true;
  label: string;
  center: LatLng;
  radiusMeters: number;
  /** Simulation minute the outage was detected. */
  startedAt: number;
  severity: "partial" | "full";
  estimatedHouseholds: number;
  confidence: number;
  active: boolean;
}

const elm = (n: number): LatLng => ({ lat: 32.9539, lng: -96.739 + (n - 400) * 0.00013 });

/** The demo outage feed, detected at T+60 minutes. */
export const SIMULATED_OUTAGE_FEED: Omit<OutageEvent, "startedAt" | "active">[] = [
  {
    id: "ting-sim-west-elm",
    type: "power",
    source: "Simulated Ting sensor feed",
    simulated: true,
    label: "West Elm St power loss",
    center: elm(410),
    radiusMeters: 140,
    severity: "full",
    estimatedHouseholds: 214,
    confidence: 0.86,
  },
  {
    id: "ting-sim-east-elm",
    type: "power",
    source: "Simulated Ting sensor feed",
    simulated: true,
    label: "East Elm St power loss",
    center: elm(451),
    radiusMeters: 100,
    severity: "partial",
    estimatedHouseholds: 96,
    confidence: 0.72,
  },
  {
    id: "carrier-sim-east-elm",
    type: "communications",
    source: "Simulated carrier status feed",
    simulated: true,
    label: "Cell site degraded (east Elm)",
    center: elm(451),
    radiusMeters: 100,
    severity: "partial",
    estimatedHouseholds: 80,
    confidence: 0.64,
  },
];

export function overlaps(point: LatLng, outage: Pick<OutageEvent, "center" | "radiusMeters">) {
  return distanceMeters(point, outage.center) <= outage.radiusMeters;
}

export function activeOutagesAt(point: LatLng, outages: OutageEvent[], type?: OutageType) {
  return outages.filter((o) => o.active && (!type || o.type === type) && overlaps(point, o));
}
