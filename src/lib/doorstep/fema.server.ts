import { env } from "./env.server";
import { SYNTHETIC_SHELTERS, type Shelter } from "./resources";

/**
 * FEMA National Shelter System (ArcGIS) adapter.
 *
 * Field names are NOT assumed: we read the layer metadata first and map fields by pattern.
 * If the service is unreachable, the layer lacks location data, or anything fails, we return
 * clearly labeled synthetic shelters instead. The default URL is the commonly published NSS
 * open-shelters layer; it could not be verified from the build sandbox — override with
 * FEMA_NSS_LAYER_URL if FEMA moves it.
 */
const DEFAULT_LAYER = "https://gis.fema.gov/arcgis/rest/services/NSS/OpenShelters/MapServer/0";

interface ArcField {
  name: string;
  type: string;
}
type Attr = Record<string, unknown>;

let cache: { at: number; data: { shelters: Shelter[]; source: string; warning?: string } } | null =
  null;

const pick = (fields: ArcField[], re: RegExp) => fields.find((f) => re.test(f.name))?.name;

function yesNo(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).toLowerCase();
  if (["y", "yes", "true", "1"].includes(s)) return true;
  if (["n", "no", "false", "0"].includes(s)) return false;
  return null;
}
const num = (v: unknown) =>
  v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v);

export async function fetchShelters(center = { lat: 32.9483, lng: -96.7299 }) {
  if (env("FEMA_SHELTERS_DISABLED") === "true")
    return { shelters: SYNTHETIC_SHELTERS, source: "synthetic", warning: "FEMA lookup disabled" };
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data;
  const layer = env("FEMA_NSS_LAYER_URL") ?? DEFAULT_LAYER;
  try {
    const meta = (await (
      await fetch(`${layer}?f=json`, { signal: AbortSignal.timeout(6000) })
    ).json()) as {
      fields?: ArcField[];
      error?: unknown;
    };
    const fields = meta.fields ?? [];
    if (meta.error || !fields.length) throw new Error("Layer metadata unavailable");
    const f = {
      name: pick(fields, /^(shelter_?name|name)$/i) ?? pick(fields, /name/i),
      status: pick(fields, /shelter_?status|^status/i),
      address: pick(fields, /^address(_1)?$/i) ?? pick(fields, /address/i),
      city: pick(fields, /^city$/i),
      ada: pick(fields, /ada|wheelchair|accessib/i),
      generator: pick(fields, /generator|backup_?power/i),
      pets: pick(fields, /pet/i),
      capacity: pick(fields, /evacuation_?capacity|^capacity|total_?capacity/i),
      population: pick(fields, /total_?population|^population|current_?pop/i),
      updated: pick(fields, /update|edit_?date|last_?/i),
    };
    if (!f.name) throw new Error("No name field in FEMA layer");
    const q = new URLSearchParams({
      where: "1=1",
      geometry: `${center.lng},${center.lat}`,
      geometryType: "esriGeometryPoint",
      inSR: "4326",
      distance: "40",
      units: "esriSRUnit_StatuteMile",
      outFields: "*",
      outSR: "4326",
      returnGeometry: "true",
      f: "json",
    });
    const data = (await (
      await fetch(`${layer}/query?${q}`, { signal: AbortSignal.timeout(8000) })
    ).json()) as {
      features?: { attributes: Attr; geometry?: { x: number; y: number } }[];
    };
    const shelters: Shelter[] = (data.features ?? [])
      .filter((x) => x.geometry)
      .slice(0, 50)
      .map((x, i) => {
        const a = x.attributes;
        const get = (k?: string) => (k ? a[k] : undefined);
        const status = String(get(f.status) ?? "").toLowerCase();
        return {
          id: `fema-${i}-${String(get(f.name)).slice(0, 20)}`,
          name: String(get(f.name)),
          location: { lat: x.geometry!.y, lng: x.geometry!.x },
          address: [get(f.address), get(f.city)].filter(Boolean).join(", "),
          status: status.includes("open") ? "open" : status.includes("clos") ? "closed" : "unknown",
          accessible: yesNo(get(f.ada)),
          generator: yesNo(get(f.generator)),
          pets: yesNo(get(f.pets)),
          capacity: num(get(f.capacity)),
          population: num(get(f.population)),
          source: "FEMA NSS",
          updatedAt: get(f.updated)
            ? new Date(Number(get(f.updated)) || String(get(f.updated))).toISOString().slice(0, 16)
            : null,
        } satisfies Shelter;
      });
    const result = shelters.length
      ? { shelters, source: "fema" }
      : {
          shelters: SYNTHETIC_SHELTERS,
          source: "synthetic",
          warning: "No open FEMA NSS shelters near Richardson; showing synthetic demo shelters",
        };
    cache = { at: Date.now(), data: result };
    return result;
  } catch (e) {
    return {
      shelters: SYNTHETIC_SHELTERS,
      source: "synthetic",
      warning: `FEMA NSS unavailable (${e instanceof Error ? e.message : "error"}); showing synthetic demo shelters`,
    };
  }
}
