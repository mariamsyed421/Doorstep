import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

export type MapBounds = [[number, number], [number, number]];
export type County = Feature<Polygon | MultiPolygon, { GEOID: string; NAME: string }>;
export type Counties = FeatureCollection<Polygon | MultiPolygon, County["properties"]>;

export function coordinateBounds(positions: Position[]): MapBounds {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const position of positions) {
    const [lng, lat] = position;
    if (lng === undefined || lat === undefined || !Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error("Invalid map coordinates");
    }
    west = Math.min(west, lng);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    north = Math.max(north, lat);
  }
  if (!positions.length) throw new Error("Cannot frame empty map geometry");
  return [
    [west, south],
    [east, north],
  ];
}

export function countyBounds(county: County): MapBounds {
  return coordinateBounds(
    county.geometry.type === "Polygon"
      ? county.geometry.coordinates.flat()
      : county.geometry.coordinates.flat(2),
  );
}

export function boundsCenter([[west, south], [east, north]]: MapBounds): [number, number] {
  return [(west + east) / 2, (south + north) / 2];
}

function inRing([lng, lat]: [number, number], ring: Position[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [ax = 0, ay = 0] = a;
    const [bx = 0, by = 0] = b;
    if (ay > lat !== by > lat && lng < ((bx - ax) * (lat - ay)) / (by - ay) + ax) {
      inside = !inside;
    }
  }
  return inside;
}

export function countyAt(counties: Counties, point: [number, number]): County | undefined {
  return counties.features.find((county) => {
    const polygons =
      county.geometry.type === "Polygon"
        ? [county.geometry.coordinates]
        : county.geometry.coordinates;
    return polygons.some(
      ([outer, ...holes]) =>
        outer && inRing(point, outer) && !holes.some((ring) => inRing(point, ring)),
    );
  });
}

// Leave space for the existing map overlays and the county selector on narrow screens.
export function mapPadding(width: number, height: number) {
  return {
    top: Math.min(150, Math.round(height * 0.32)),
    bottom: Math.min(110, Math.round(height * 0.24)),
    left: Math.min(60, Math.round(width * 0.1)),
    right: Math.min(60, Math.round(width * 0.1)),
  };
}

// The statewide view needs less room: tighter padding keeps Texas filling the map.
export function statePadding(width: number, height: number) {
  return {
    top: Math.min(72, Math.round(height * 0.1)),
    bottom: Math.min(36, Math.round(height * 0.05)),
    left: Math.min(32, Math.round(width * 0.04)),
    right: Math.min(32, Math.round(width * 0.04)),
  };
}
