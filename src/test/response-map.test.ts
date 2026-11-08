import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createExpression,
  featureFilter,
  validateStyleMin,
} from "@maplibre/maplibre-gl-style-spec";
import type { StyleSpecification } from "maplibre-gl";
import {
  coordinateBounds,
  countyAt,
  countyBounds,
  mapPadding,
  type Counties,
  type County,
} from "@/lib/response-map-geometry";
import { addResponseLayers, buildingLayer, BUILDING_FILTER } from "@/lib/response-map-layers";

const counties = JSON.parse(readFileSync("public/geo/texas-counties.geojson", "utf8")) as Counties;
const style: StyleSpecification = {
  version: 8,
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  sources: { openmaptiles: { type: "vector", tiles: ["https://example.test/{z}/{x}/{y}.pbf"] } },
  layers: [{ id: "building", type: "fill", source: "openmaptiles", "source-layer": "building" }],
};

function expressionValue(value: unknown, properties: Record<string, unknown>) {
  const expression = createExpression(value, "layers[0].paint.fill-extrusion-height");
  if (expression.result !== "success") throw new Error(JSON.stringify(expression.value));
  return expression.value.evaluate({ zoom: 16 }, { type: "Polygon", properties });
}

describe("Texas county geometry", () => {
  it("ships all 254 counties with stable, unique Texas FIPS identifiers and closed rings", () => {
    expect(counties.features).toHaveLength(254);
    expect(new Set(counties.features.map((f) => f.id)).size).toBe(254);
    counties.features.forEach((feature) => {
      expect(feature.id).toBe(feature.properties.GEOID);
      expect(feature.properties.GEOID).toMatch(/^48\d{3}$/);
      const polygons =
        feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      polygons.forEach((polygon) =>
        polygon.forEach((ring) => {
          expect(ring.length).toBeGreaterThanOrEqual(4);
          expect(ring.at(-1)).toEqual(ring[0]);
        }),
      );
      const [[west, south], [east, north]] = countyBounds(feature);
      expect(west).toBeLessThan(east);
      expect(south).toBeLessThan(north);
      expect(west).toBeGreaterThan(-107);
      expect(east).toBeLessThan(-93);
      expect(south).toBeGreaterThan(25);
      expect(north).toBeLessThan(37);
    });
  });

  it.each([
    [-96.8, 32.78, "Dallas County"],
    [-96.63, 33.2, "Collin County"],
    [-97.7431, 30.2672, "Travis County"],
    [-95.3698, 29.7604, "Harris County"],
    [-106.485, 31.7619, "El Paso County"],
  ] as const)("locates %s, %s in %s using polygon geometry", (lng, lat, name) => {
    expect(countyAt(counties, [lng, lat])?.properties.NAME).toBe(name);
  });

  it("frames all multipolygon parts rather than just the first island or a hardcoded center", () => {
    const county: County = {
      type: "Feature",
      properties: { NAME: "Test", GEOID: "48000" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [0, 0],
              [1, 0],
              [1, 1],
              [0, 0],
            ],
          ],
          [
            [
              [3, 4],
              [5, 4],
              [5, 6],
              [3, 4],
            ],
          ],
        ],
      },
    };
    expect(countyBounds(county)).toEqual([
      [0, 0],
      [5, 6],
    ]);
  });

  it("does not select holes or points outside the county polygons", () => {
    const county: County = {
      type: "Feature",
      properties: { NAME: "Test", GEOID: "48000" },
      geometry: {
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
            [2, 1],
            [2, 2],
            [1, 2],
            [1, 1],
          ],
        ],
      },
    };
    const data: Counties = { type: "FeatureCollection", features: [county] };
    expect(countyAt(data, [0.5, 0.5])).toBe(county);
    expect(countyAt(data, [1.5, 1.5])).toBeUndefined();
    expect(countyAt(data, [8, 8])).toBeUndefined();
    expect(() => coordinateBounds([])).toThrow();
    expect(() => coordinateBounds([[NaN, 0]])).toThrow();
  });

  it("leaves useful map area on both desktop and mobile", () => {
    for (const [width, height] of [
      [1000, 700],
      [368, 420],
      [280, 220],
    ]) {
      const padding = mapPadding(width!, height!);
      expect(padding.left + padding.right).toBeLessThan(width! / 2);
      expect(padding.top + padding.bottom).toBeLessThan(height! * 0.6);
    }
  });
});

describe("Real building extrusion", () => {
  it("reuses the existing building source only at neighborhood zoom", () => {
    const layer = buildingLayer(style);
    expect(layer?.source).toBe("openmaptiles");
    expect(layer?.["source-layer"]).toBe("building");
    expect(layer?.minzoom).toBe(14);
    expect(layer?.layout?.visibility).toBe("none");
    expect(validateStyleMin({ ...style, layers: [...style.layers, layer!] })).toEqual([]);
  });

  it.each([
    [{ render_height: 120, render_min_height: 10 }, 120, 10],
    [{}, 8, 0],
    [{ render_height: "24", render_min_height: "3" }, 24, 3],
    [{ render_height: "unknown", render_min_height: -5 }, 8, 0],
    [{ render_height: -4 }, 8, 0],
    [{ render_height: 4, render_min_height: 6 }, 6, 6],
  ])("uses supplied heights with safe fallbacks for %j", (properties, height, base) => {
    const paint = buildingLayer(style)!.paint!;
    expect(expressionValue(paint["fill-extrusion-height"], properties)).toBe(height);
    expect(expressionValue(paint["fill-extrusion-base"], properties)).toBe(base);
  });

  it("honors hide_3d to avoid extruding duplicate outlines or excluded parts", () => {
    const filter = featureFilter(BUILDING_FILTER, "layers[0].filter");
    for (const hide of [true, "true", 1]) {
      expect(filter.filter({ zoom: 16 }, { type: "Polygon", properties: { hide_3d: hide } })).toBe(
        false,
      );
    }
    expect(filter.filter({ zoom: 16 }, { type: "Polygon", properties: {} })).toBe(true);
    expect(filter.filter({ zoom: 16 }, { type: "Polygon", properties: { hide_3d: false } })).toBe(
      true,
    );
  });

  it("gracefully omits extrusion when the basemap has no suitable building source", () => {
    expect(buildingLayer({ version: 8, sources: {}, layers: [] })).toBeNull();
    expect(
      buildingLayer({
        ...style,
        sources: {
          openmaptiles: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        },
      }),
    ).toBeNull();
  });

  it("validates all response layers and preserves a county map when the basemap is unavailable", () => {
    for (const initial of [style, { version: 8, sources: {}, layers: [] } as StyleSpecification]) {
      const result = structuredClone(initial);
      const map = {
        getStyle: () => result,
        addSource: (id: string, source: StyleSpecification["sources"][string]) => {
          result.sources[id] = source;
        },
        addLayer: (layer: StyleSpecification["layers"][number]) => {
          result.layers.push(layer);
        },
      };
      addResponseLayers(map as unknown as Parameters<typeof addResponseLayers>[0]);
      expect(validateStyleMin(result)).toEqual([]);
      expect(result.layers.map((layer) => layer.id)).toEqual(
        expect.arrayContaining([
          "county-fill",
          "county-boundaries",
          "response-heatmap",
          "response-district-fill",
          "walking-route",
        ]),
      );
    }
  });
});
