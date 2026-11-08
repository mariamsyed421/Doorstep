import type { Feature, Geometry, Polygon, Position } from "geojson";
import { distanceMeters } from "@/lib/doorstep/geo";
import { DEFAULT_BUILDING_HEIGHT } from "@/lib/response-map-layers";

export type MapPosition = [number, number];
export interface BuildingAnchor {
  position: MapPosition;
  height: number;
  buildingId: string;
  footprint: Polygon;
}
export type BuildingAnchors = Record<string, BuildingAnchor>;
interface HouseholdLocation {
  id: string;
  lng: number;
  lat: number;
}

function inRing([x, y]: MapPosition, ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const [ax = 0, ay = 0] = a;
    const [bx = 0, by = 0] = b;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function insideBuilding(point: MapPosition, polygon: Polygon) {
  const [outer, ...holes] = polygon.coordinates;
  return Boolean(outer && inRing(point, outer) && !holes.some((ring) => inRing(point, ring)));
}

function ringArea(ring: Position[]) {
  const [ox = 0, oy = 0] = ring[0] ?? [];
  let crossSum = 0;
  let xSum = 0;
  let ySum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax = 0, ay = 0] = ring[i]!;
    const [bx = 0, by = 0] = ring[i + 1]!;
    const cross = (ax - ox) * (by - oy) - (bx - ox) * (ay - oy);
    crossSum += cross;
    xSum += (ax + bx - 2 * ox) * cross;
    ySum += (ay + by - 2 * oy) * cross;
  }
  return {
    area: Math.abs(crossSum / 2),
    center: [ox + xSum / (3 * crossSum), oy + ySum / (3 * crossSum)] as MapPosition,
  };
}

/** An interior roof point, including concave footprints whose area centroid is outside. */
export function interiorBuildingPoint(polygon: Polygon): MapPosition | null {
  const outer = polygon.coordinates[0];
  if (
    !outer ||
    outer.length < 4 ||
    outer.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))
  )
    return null;
  const { center, area } = ringArea(outer);
  if (!area) return null;
  if (insideBuilding(center, polygon)) return center;
  const ys = outer.map((p) => p[1]!);
  const y = (Math.min(...ys) + Math.max(...ys)) / 2;
  const xs: number[] = [];
  for (const ring of polygon.coordinates) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax = 0, ay = 0] = ring[i]!;
      const [bx = 0, by = 0] = ring[j]!;
      if (ay > y !== by > y) xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
  }
  xs.sort((a, b) => a - b);
  let point: MapPosition | null = null;
  let widest = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    const width = xs[i + 1]! - xs[i]!;
    if (width > widest) {
      widest = width;
      point = [(xs[i]! + xs[i + 1]!) / 2, y];
    }
  }
  return point && insideBuilding(point, polygon) ? point : null;
}

/** Mirrors the extrusion layer's height fallback and base-height clamp. */
export function buildingRoofHeight(properties: Record<string, unknown>) {
  const height = Number(properties["render_height"]);
  const base = Number(properties["render_min_height"]);
  return Math.max(
    Number.isFinite(height) && height > 0 ? height : DEFAULT_BUILDING_HEIGHT,
    Number.isFinite(base) ? Math.max(0, base) : 0,
  );
}

/**
 * Display-only placement of synthetic households on nearby real building footprints.
 * This is not address geocoding. Existing anchors are kept across filters, tile reloads
 * and camera changes; no footprint is shared by two demo households.
 */
export function matchHouseholdBuildings(
  households: HouseholdLocation[],
  features: Feature<Geometry>[],
  existing: BuildingAnchors = {},
  maxDistance = 200,
): BuildingAnchors {
  const candidates = new Map<string, BuildingAnchor & { area: number }>();
  for (const feature of features) {
    const properties = feature.properties ?? {};
    if ([true, "true", 1].includes(properties["hide_3d"])) continue;
    const geometry = feature.geometry;
    const parts =
      geometry.type === "Polygon"
        ? [geometry.coordinates]
        : geometry.type === "MultiPolygon"
          ? geometry.coordinates
          : [];
    for (const coordinates of parts) {
      const footprint: Polygon = { type: "Polygon", coordinates };
      const position = interiorBuildingPoint(footprint);
      if (!position) continue;
      if (
        !households.some(
          (h) => distanceMeters(h, { lng: position[0], lat: position[1] }) <= maxDistance,
        )
      )
        continue;
      const outerArea = ringArea(coordinates[0]!).area;
      const area =
        (outerArea - coordinates.slice(1).reduce((sum, ring) => sum + ringArea(ring).area, 0)) *
        111_320 ** 2 *
        Math.cos((position[1] * Math.PI) / 180);
      // Exclude sheds and large commercial/merged blocks from the household demo.
      if (area < 30 || area > 1000) continue;
      const id = feature.id ?? properties["osm_id"];
      // Tiles may merge multiple separate houses into one MultiPolygon feature.
      const buildingId = `building:${id ?? "geometry"}:${position.map((n) => n.toFixed(7)).join(",")}`;
      const previous = candidates.get(buildingId);
      if (!previous || area > previous.area)
        candidates.set(buildingId, {
          position,
          height: buildingRoofHeight(properties),
          buildingId,
          footprint,
          area,
        });
    }
  }
  const used = new Set(Object.values(existing).map((a) => a.buildingId));
  const pairs: { id: string; anchor: BuildingAnchor; distance: number }[] = [];
  for (const household of households) {
    if (existing[household.id]) continue;
    for (const anchor of candidates.values()) {
      if (used.has(anchor.buildingId)) continue;
      const distance = distanceMeters(household, {
        lng: anchor.position[0],
        lat: anchor.position[1],
      });
      if (distance <= maxDistance) pairs.push({ id: household.id, anchor, distance });
    }
  }
  pairs.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.id.localeCompare(b.id) ||
      a.anchor.buildingId.localeCompare(b.anchor.buildingId),
  );
  let result = existing;
  const occupied = Object.values(existing);
  for (const pair of pairs) {
    if (result[pair.id] || used.has(pair.anchor.buildingId)) continue;
    if (
      occupied.some(
        (anchor) =>
          insideBuilding(anchor.position, pair.anchor.footprint) ||
          insideBuilding(pair.anchor.position, anchor.footprint),
      )
    )
      continue;
    if (result === existing) result = { ...existing };
    result[pair.id] = pair.anchor;
    used.add(pair.anchor.buildingId);
    occupied.push(pair.anchor);
  }
  return result;
}

/** Project a normalized Mercator point with MapLibre's public, same-frame render matrix. */
export function projectRoofPoint(
  point: { x: number; y: number; z: number },
  matrix: ArrayLike<number>,
  width: number,
  height: number,
): MapPosition | null {
  const { x, y, z } = point;
  const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
  if (!Number.isFinite(w) || w <= 0) return null;
  const clipX = matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!;
  const clipY = matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!;
  return [((clipX / w + 1) * width) / 2, ((1 - clipY / w) * height) / 2];
}
