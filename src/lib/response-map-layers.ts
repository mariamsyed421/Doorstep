import type { FeatureCollection } from "geojson";
import type {
  FillExtrusionLayerSpecification,
  FilterSpecification,
  Map,
  StyleSpecification,
} from "maplibre-gl";
import { TEXAS_OUTLINE } from "@/lib/texas-boundary";

export const EMPTY_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };
export const BUILDING_MIN_ZOOM = 14;
export const BUILDING_FILTER: FilterSpecification = [
  "all",
  ["!=", ["get", "hide_3d"], true],
  ["!=", ["get", "hide_3d"], "true"],
  ["!=", ["get", "hide_3d"], 1],
];

export function buildingLayer(style: StyleSpecification): FillExtrusionLayerSpecification | null {
  // Discover the existing building tiles rather than adding a second tile service.
  const footprints = style.layers.find(
    (layer) =>
      layer.type === "fill" &&
      layer["source-layer"] === "building" &&
      style.sources[layer.source]?.type === "vector",
  );
  if (!footprints || footprints.type !== "fill") return null;
  return {
    id: "response-buildings",
    type: "fill-extrusion",
    source: footprints.source,
    "source-layer": "building",
    minzoom: BUILDING_MIN_ZOOM,
    filter: BUILDING_FILTER,
    layout: { visibility: "none" },
    paint: {
      "fill-extrusion-color": "#d6d5d0",
      "fill-extrusion-height": [
        "max",
        0,
        ["to-number", ["get", "render_min_height"], 0],
        [
          "case",
          [">", ["to-number", ["get", "render_height"], 8], 0],
          ["to-number", ["get", "render_height"], 8],
          8,
        ],
      ],
      "fill-extrusion-base": ["max", 0, ["to-number", ["get", "render_min_height"], 0]],
      "fill-extrusion-opacity": 0.9,
      "fill-extrusion-vertical-gradient": true,
    },
  };
}

export function addResponseLayers(map: Map) {
  const labels = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
  map.addSource("texas-outline", {
    type: "geojson",
    data: {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: TEXAS_OUTLINE },
    },
  });
  map.addLayer(
    {
      id: "texas-outline",
      type: "line",
      source: "texas-outline",
      paint: { "line-color": "#ed1d24", "line-width": 1.5, "line-opacity": 0.6 },
    },
    labels,
  );

  map.addSource("texas-counties", { type: "geojson", data: EMPTY_COLLECTION, promoteId: "GEOID" });
  map.addLayer(
    {
      id: "county-fill",
      type: "fill",
      source: "texas-counties",
      paint: {
        // Choropleth of residents silent at home (mock statewide data).
        "fill-color": [
          "step",
          ["to-number", ["get", "home"], 0],
          "#fbeee6",
          1,
          "#f8d3bd",
          5,
          "#f39465",
          20,
          "#ec6245",
          60,
          "#ed1d24",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.75,
            ["boolean", ["feature-state", "hover"], false],
            0.8,
            0.55,
          ],
          9,
          ["case", ["boolean", ["feature-state", "hover"], false], 0.3, 0.12],
          12,
          0,
        ],
        "fill-opacity-transition": { duration: 180 },
      },
    },
    labels,
  );
  map.addLayer(
    {
      id: "county-boundaries",
      type: "line",
      source: "texas-counties",
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "#ed1d24",
          ["boolean", ["feature-state", "hover"], false],
          "#ed1d24",
          "#858b93",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          2.5,
          ["boolean", ["feature-state", "hover"], false],
          2,
          0.7,
        ],
        "line-opacity": 0.85,
      },
    },
    labels,
  );
  if (map.getStyle().glyphs)
    map.addLayer(
      {
        id: "county-labels",
        type: "symbol",
        source: "texas-counties",
        minzoom: 5,
        maxzoom: 11,
        layout: {
          "text-field": ["get", "NAME"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10,
          "text-max-width": 8,
          "text-padding": 6,
        },
        paint: { "text-color": "#62666d", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
      labels,
    );

  map.addSource("response-density", { type: "geojson", data: EMPTY_COLLECTION });
  map.addLayer(
    {
      id: "response-heatmap",
      type: "heatmap",
      source: "response-density",
      paint: {
        "heatmap-weight": ["interpolate", ["linear"], ["get", "count"], 0, 0, 9, 1],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 9, 2, 13, 3.5],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 28, 9, 38, 13, 60, 16, 80],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(246, 198, 168, 0)",
          0.2,
          "rgba(246, 198, 168, 0.5)",
          0.45,
          "#f39465",
          0.7,
          "#ec6245",
          1,
          "#ed1d24",
        ],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 14, 0.7, 16, 0],
      },
    },
    labels,
  );

  map.addSource("response-districts", { type: "geojson", data: EMPTY_COLLECTION });
  map.addLayer(
    {
      id: "response-district-fill",
      type: "fill",
      source: "response-districts",
      minzoom: 10,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.32, 0.04],
      },
    },
    labels,
  );
  map.addLayer(
    {
      id: "response-district-lines",
      type: "line",
      source: "response-districts",
      minzoom: 10,
      paint: { "line-color": ["get", "color"], "line-width": 1 },
    },
    labels,
  );
  map.addSource("walking-route", { type: "geojson", data: EMPTY_COLLECTION });
  map.addLayer({
    id: "walking-route",
    type: "line",
    source: "walking-route",
    paint: { "line-color": "#ed1d24", "line-width": 3, "line-dasharray": [2, 3] },
  });

  const buildings = buildingLayer(map.getStyle());
  if (buildings) map.addLayer(buildings, labels);
  return buildings;
}
