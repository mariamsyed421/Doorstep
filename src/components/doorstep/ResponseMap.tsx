import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Minus, Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MapContainer,
  Polygon,
  Marker,
  Tooltip,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import {
  DISTRICTS,
  RESIDENTS,
  districtCount,
  urgency,
  markerState,
  type Resolutions,
  type Resident,
} from "@/lib/doorstep-data";
import { TEXAS_BOUNDS, TEXAS_OUTLINE } from "@/lib/texas-boundary";

const texasPolygon: [number, number][] = TEXAS_OUTLINE.map(([lng, lat]) => [lat, lng]);
const texasMask: [number, number][][] = [
  [
    [85, -180],
    [85, 180],
    [-85, 180],
    [-85, -180],
  ],
  texasPolygon,
];
const cityBounds = DISTRICTS.flatMap((d) => d.polygon);
const statePadding: L.FitBoundsOptions = {
  paddingTopLeft: [45, 95],
  paddingBottomRight: [45, 90],
};

setWorkerUrl(workerUrl);
interface Props {
  district: string | null;
  markers: Record<string, MarkerState>;
  assessments: Record<string, Assessment>;
  outages: OutageEvent[];
  elmUnconfirmed: number;
  /** Priority filter from the queue: only these residents get markers. */
  visible: Set<string>;
  heatmap: boolean;
  selected: string | null;
  walking: string | null;
  onDistrict: (id: string | null) => void;
  onSelect: (id: string) => void;
}
function BaseMap({ resolved }: Pick<Props, "resolved">) {
  const map = useMap();
  const source = useRef<GeoJSONSource | null>(null);
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: DISTRICTS.map((district) => {
        const center = L.latLngBounds(district.polygon).getCenter();
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [center.lng, center.lat] },
          properties: { count: districtCount(district, resolved) },
        };
      }),
    }),
    [resolved],
  );
  const latestData = useRef(data);

  useEffect(() => {
    latestData.current = data;
    source.current?.setData(data);
  }, [data]);

  useEffect(() => {
    const layer = maplibreGL({
      style: "https://tiles.openfreemap.org/styles/positron",
      attributionControl: false,
    }).addTo(map);
    map.attributionControl.addAttribution(
      '© <a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles © OpenStreetMap',
    );
    const gl = layer.getMaplibreMap();
    const addHeatmap = () => {
      gl.addSource("response-density", { type: "geojson", data: latestData.current });
      source.current = gl.getSource("response-density") as GeoJSONSource;
      // Keep place names readable above the density surface.
      const labels = gl.getStyle().layers.find((item) => item.type === "symbol")?.id;
      gl.addLayer(
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
              "#e1261c",
            ],
            "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 14, 0.7, 16, 0],
          },
        },
        labels,
      );
    };
    gl.on("load", addHeatmap);
    return () => {
      gl.off("load", addHeatmap);
      source.current = null;
      map.removeLayer(layer);
    };
  }, [map]);
  return null;
}
/** Queue → map sync: fly to the selected household at street zoom. */
function FocusSelected({ selected, district }: Pick<Props, "selected" | "district">) {
  const map = useMap();
  useEffect(() => {
    const r = RESIDENTS.find((x) => x.id === selected);
    if (!r || district !== "elm") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 18.5), { duration: reduce ? 0 : 0.8 });
  }, [selected, district, map]);
  return null;
}
function Controller({ district, onDistrict }: Pick<Props, "district" | "onDistrict">) {
  const map = useMap();
  useEffect(() => {
    const constrainZoom = () => {
      const size = map.getSize();
      const padding = L.point(Math.min(90, size.x / 4), Math.min(185, size.y / 3));
      // getBoundsZoom clamps to the current minimum; clear it before measuring
      // so a smaller viewport can zoom out far enough to fit the whole state.
      map.setMinZoom(0);
      map.setMinZoom(map.getBoundsZoom(TEXAS_BOUNDS, false, padding));
    };
    constrainZoom();
    const resize = () => {
      constrainZoom();
      if (map.getZoom() < 10) map.fitBounds(TEXAS_BOUNDS, statePadding);
    };
    map.on("resize", resize);
    return () => {
      map.off("resize", resize);
    };
  }, [map]);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map.stop();
    if (!district) map.flyToBounds(TEXAS_BOUNDS, { ...statePadding, duration: reduce ? 0 : 1.2 });
    else if (district === "elm")
      map.flyToBounds(
        RESIDENTS.map((r) => [r.lat, r.lng] as [number, number]),
        { padding: [45, 100], duration: reduce ? 0 : 1.5, maxZoom: 19 },
      );
    else {
      const d = DISTRICTS.find((d) => d.id === district);
      if (d)
        map.flyToBounds(d.polygon, { padding: [50, 50], maxZoom: 15, duration: reduce ? 0 : 1.5 });
    }
  }, [district, map]);
  useMapEvents({
    zoomend: () => {
      if (map.getZoom() < 10 && district) onDistrict(null);
    },
  });
  return (
    <div className="map-float right-5 bottom-10 flex flex-col rounded-lg p-1">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => map.zoomIn()}
      >
        <Plus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => map.zoomOut()}
      >
        <Minus />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Reset map to Texas"
        title="Reset map to Texas"
        onClick={() => {
          onDistrict(null);
          map.stop();
          map.fitBounds(TEXAS_BOUNDS, statePadding);
        }}
      >
        <Crosshair />
      </Button>
    </div>
  );
}
function dot(state: MarkerState, selected: boolean) {
  return L.divIcon({
    className: `household-marker${selected ? " is-selected" : ""}`,
    html: `<span class="porch-dot ${state}">${state === "unknown" ? "?" : state === "away" ? "↗" : ""}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}
function DistrictLayers(props: Props) {
  const map = useMap();
  const [overview, setOverview] = useState(map.getZoom() < 10);
  useMapEvents({ zoomend: () => setOverview(map.getZoom() < 10) });
  if (props.district === "elm") return null;
  if (overview)
    return (
      <Marker
        position={[32.9539, -96.745]}
        icon={L.divIcon({
          className: "region-name-marker",
          html: "<strong>Richardson, TX</strong><span>9 neighborhoods · Explore →</span>",
          iconSize: [180, 56],
          iconAnchor: [90, -22],
        })}
        alt="Explore Richardson response neighborhoods"
        keyboard
        eventHandlers={{
          click: () => map.fitBounds(cityBounds, { padding: [65, 100], maxZoom: 13.8 }),
        }}
      />
    );
  return (
    <>
      {DISTRICTS.map((d) => {
        const count = districtCount(d, props.resolved);
        const tone = urgency(count);
        const bounds = L.latLngBounds(d.polygon);
        const center = bounds.getCenter();
        return (
          <Fragment key={d.id}>
            <Polygon
              positions={d.polygon}
              pathOptions={{
                className: `district-polygon district-${tone}`,
                weight: 1,
                fillOpacity: 0.04,
              }}
              eventHandlers={{ click: () => props.onDistrict(d.id) }}
            >
              <Tooltip sticky>
                <strong>{d.name}</strong>
                <br />
                {count} silent at home · {d.liveAloneSilent} live alone
              </Tooltip>
            </Polygon>
            <Marker
              position={center}
              icon={L.divIcon({
                className: "district-name-marker",
                html: `<span>${d.name}</span><b>${count}</b>`,
                iconSize: [130, 48],
                iconAnchor: [65, 24],
              })}
              eventHandlers={{ click: () => props.onDistrict(d.id) }}
              keyboard
              alt={`${d.name}, ${count} silent at home`}
            >
              <Tooltip>
                {d.name} · {count} silent at home · {d.liveAloneSilent} live alone
              </Tooltip>
            </Marker>
          </Fragment>
        );
      })}
    </>
  );
}

export default function ResponseMap(props: Props) {
  const r = RESIDENTS.find((r) => r.id === props.walking);
  return (
    <MapContainer
      bounds={TEXAS_BOUNDS}
      boundsOptions={statePadding}
      maxBounds={[
        [24.5, -108],
        [37.5, -92.5],
      ]}
      maxBoundsViscosity={1}
      minZoom={4}
      maxZoom={19}
      zoomSnap={0.25}
      zoomControl={false}
      scrollWheelZoom
      className="response-map"
      attributionControl
    >
      <BaseMap resolved={props.resolved} />
      <Polygon
        positions={texasMask}
        interactive={false}
        pathOptions={{ stroke: false, fillColor: "#ffffff", fillOpacity: 1, fillRule: "evenodd" }}
      />
      <Polygon
        positions={texasPolygon}
        interactive={false}
        pathOptions={{ className: "texas-outline", weight: 1.5, opacity: 0.6, fillOpacity: 0 }}
      />
      <Controller district={props.district} onDistrict={props.onDistrict} />
      <DistrictLayers {...props} />
      {props.district === "elm" &&
        RESIDENTS.filter((r) => props.visible.has(r.id)).map((r) => (
          <Marker
            key={`${r.id}-${props.markers[r.id]}-${props.selected === r.id}`}
            position={[r.lat, r.lng]}
            icon={dot(props.markers[r.id] ?? "unknown", props.selected === r.id)}
            alt={`${r.name}, ${r.address}`}
            keyboard
            eventHandlers={{ click: () => props.onSelect(r.id) }}
          >
            <Tooltip
              permanent={props.selected === r.id}
              direction="top"
              offset={[0, -12]}
              className="resident-tooltip"
            >
              <strong>
                {r.shortName} · {r.address}
              </strong>
              {props.assessments[r.id] && (
                <>
                  <br />
                  Score {props.assessments[r.id]?.score} ·{" "}
                  {props.assessments[r.id]?.level.toUpperCase()}
                </>
              )}
              <br />“{r.planQuote}”
            </Tooltip>
          </Marker>
        ))}
      {r && (
        <>
          <Polyline
            positions={[
              [r.neighbor.lat, r.neighbor.lng],
              [r.lat, r.lng],
            ]}
            pathOptions={{ className: "walking-route", dashArray: "7 8", weight: 3 }}
          />
          <Marker
            position={[r.neighbor.lat, r.neighbor.lng]}
            icon={L.divIcon({
              className: "walking-marker",
              html: "<span>↟</span>",
              iconSize: [30, 30],
            })}
          >
            <Tooltip permanent>{r.neighbor.name.split(" ")[0]} is on the way</Tooltip>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
