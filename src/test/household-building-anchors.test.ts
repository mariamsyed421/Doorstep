import { describe, expect, it } from "vitest";
import type { Feature, Polygon } from "geojson";
import {
  buildingRoofHeight,
  insideBuilding,
  interiorBuildingPoint,
  matchHouseholdBuildings,
  projectRoofPoint,
} from "@/lib/household-building-anchors";

function house(id: number, x: number, y = 32): Feature<Polygon> {
  return {
    type: "Feature",
    id,
    properties: { render_height: 6 },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x, y],
          [x + 0.0001, y],
          [x + 0.0001, y + 0.0001],
          [x, y + 0.0001],
          [x, y],
        ],
      ],
    },
  };
}
const residents = [
  { id: "a", lng: -96.00005, lat: 32.00005 },
  { id: "b", lng: -96.00004, lat: 32.00005 },
];

describe("Household display anchors", () => {
  it("assigns distinct nearby footprints without changing the resident coordinates", () => {
    const original = structuredClone(residents);
    const features = [house(1, -96), house(2, -96.0003)];
    const anchors = matchHouseholdBuildings(residents, features);
    expect(Object.keys(anchors)).toHaveLength(2);
    expect(new Set(Object.values(anchors).map((a) => a.buildingId)).size).toBe(2);
    for (const anchor of Object.values(anchors))
      expect(insideBuilding(anchor.position, anchor.footprint)).toBe(true);
    expect(residents).toEqual(original);
  });
  it("splits real tile MultiPolygons containing multiple separate houses", () => {
    const features = [
      {
        ...house(1, -96),
        geometry: {
          type: "MultiPolygon" as const,
          coordinates: [
            house(1, -96).geometry.coordinates,
            house(1, -96.0003).geometry.coordinates,
          ],
        },
      },
    ];
    expect(Object.keys(matchHouseholdBuildings(residents, features))).toHaveLength(2);
  });
  it("does not assign two clipped or duplicate tile features to the same roof", () => {
    const features = [house(1, -96), house(2, -96)];
    expect(Object.keys(matchHouseholdBuildings(residents, features))).toHaveLength(1);
  });
  it("is deterministic across feature order and preserves anchors when tiles or filters change", () => {
    const features = [house(1, -96), house(2, -96.0003)];
    const anchors = matchHouseholdBuildings(residents, features);
    expect(matchHouseholdBuildings([...residents].reverse(), [...features].reverse())).toEqual(
      anchors,
    );
    expect(matchHouseholdBuildings(residents, [], anchors)).toBe(anchors);
    expect(matchHouseholdBuildings(residents, [house(3, -96.00005)], anchors)).toBe(anchors);
  });
  it("keeps missing or distant geometry unmatched instead of inventing building positions", () => {
    expect(matchHouseholdBuildings(residents, [])).toEqual({});
    expect(matchHouseholdBuildings(residents, [house(1, -97)])).toEqual({});
    expect(matchHouseholdBuildings(residents, [house(1, -96)], {}, 1)).toEqual({});
    expect(
      matchHouseholdBuildings(residents, [{ ...house(1, -96), properties: { hide_3d: true } }]),
    ).toEqual({});
  });
  it("does not mistake merged commercial blocks or small sheds for homes", () => {
    const large = house(1, -96);
    large.geometry.coordinates = [
      [
        [-96, 32],
        [-95.999, 32],
        [-95.999, 32.001],
        [-96, 32.001],
        [-96, 32],
      ],
    ];
    const small = house(2, -96);
    small.geometry.coordinates = [
      [
        [-96, 32],
        [-95.99999, 32],
        [-95.99999, 32.00001],
        [-96, 32.00001],
        [-96, 32],
      ],
    ];
    expect(matchHouseholdBuildings(residents, [large, small])).toEqual({});
  });
  it("finds an interior point in concave roofs and avoids courtyard holes", () => {
    const concave: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 1],
          [1, 1],
          [1, 4],
          [0, 4],
          [0, 0],
        ],
      ],
    };
    const courtyard: Polygon = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [4, 0],
          [4, 4],
          [0, 4],
          [0, 0],
        ],
        [
          [1, 1],
          [3, 1],
          [3, 3],
          [1, 3],
          [1, 1],
        ],
      ],
    };
    for (const polygon of [concave, courtyard]) {
      const point = interiorBuildingPoint(polygon);
      expect(point).not.toBeNull();
      expect(insideBuilding(point!, polygon)).toBe(true);
    }
    expect(
      interiorBuildingPoint({
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
          ],
        ],
      }),
    ).toBeNull();
  });
  it.each([
    [{}, 8],
    [{ render_height: 6 }, 6],
    [{ render_height: "12", render_min_height: 2 }, 12],
    [{ render_height: -3 }, 8],
    [{ render_height: "unknown" }, 8],
    [{ render_height: 3, render_min_height: 10 }, 10],
  ])("matches the actual extrusion height for %j", (properties, height) => {
    expect(buildingRoofHeight(properties)).toBe(height);
  });
});

describe("Roof projection", () => {
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  it("uses viewport dimensions and homogeneous perspective division", () => {
    expect(projectRoofPoint({ x: 0, y: 0, z: 0 }, identity, 800, 600)).toEqual([400, 300]);
    const perspective = [...identity];
    perspective[11] = 1;
    expect(projectRoofPoint({ x: 1, y: 1, z: 1 }, perspective, 800, 600)).toEqual([600, 150]);
  });
  it("projects height through the same matrix instead of a fixed upward pixel offset", () => {
    const pitched = [...identity];
    pitched[9] = 2;
    expect(projectRoofPoint({ x: 0, y: 0, z: 0.25 }, pitched, 800, 600)).toEqual([400, 150]);
    const rotated = [...pitched];
    rotated[8] = 1;
    expect(projectRoofPoint({ x: 0, y: 0, z: 0.25 }, rotated, 800, 600)).toEqual([500, 150]);
  });
  it("hides points behind the camera", () => {
    const behind = [...identity];
    behind[15] = -1;
    expect(projectRoofPoint({ x: 0, y: 0, z: 0 }, behind, 800, 600)).toBeNull();
  });
});
