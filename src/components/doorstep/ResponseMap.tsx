import { Fragment, useEffect } from "react";
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
import { setWorkerUrl } from "maplibre-gl";
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
setWorkerUrl(workerUrl);
interface Props {
  district: string | null;
  resolved: Resolutions;
  selected: string | null;
  walking: string | null;
  onDistrict: (id: string | null) => void;
  onSelect: (id: string) => void;
}
function BaseMap() {
  const map = useMap();
  useEffect(() => {
    const layer = maplibreGL({
      style: "https://tiles.openfreemap.org/styles/dark",
      attributionControl: false,
    }).addTo(map);
    map.attributionControl.addAttribution(
      '© <a href="https://openfreemap.org">OpenFreeMap</a> © OpenMapTiles © OpenStreetMap',
    );
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);
  return null;
}
function Controller({ district, onDistrict }: Pick<Props, "district" | "onDistrict">) {
  const map = useMap();
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!district)
      map.flyToBounds(
        DISTRICTS.flatMap((d) => d.polygon),
        { padding: [45, 80], duration: reduce ? 0 : 1.5, maxZoom: 13.8 },
      );
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
      if (map.getZoom() < 12.5 && district) onDistrict(null);
      if (map.getZoom() > 15 && !district) onDistrict("elm");
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
        aria-label="Reset map to city"
        title="Reset map to city"
        onClick={() => {
          onDistrict(null);
          map.fitBounds(
            DISTRICTS.flatMap((d) => d.polygon),
            { padding: [45, 80] },
          );
        }}
      >
        <Crosshair />
      </Button>
    </div>
  );
}
function dot(r: Resident, resolved: Resolutions) {
  const state = markerState(r, resolved);
  return L.divIcon({
    className: "household-marker",
    html: `<span class="porch-dot ${state}">${state === "unknown" ? "?" : state === "away" ? "↗" : ""}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}
export default function ResponseMap(props: Props) {
  const r = RESIDENTS.find((r) => r.id === props.walking);
  return (
    <MapContainer
      center={[32.954, -96.758]}
      zoom={12.5}
      zoomControl={false}
      scrollWheelZoom
      className="response-map"
      attributionControl
    >
      <BaseMap />
      <Controller district={props.district} onDistrict={props.onDistrict} />
      {(!props.district || props.district !== "elm") &&
        DISTRICTS.map((d) => {
          const count = districtCount(d, props.resolved);
          const tone = urgency(count);
          const center = L.polygon(d.polygon).getBounds().getCenter();
          return (
            <Fragment key={d.id}>
              <Polygon
                positions={d.polygon}
                pathOptions={{
                  className: `district-polygon district-${tone}`,
                  weight: 1.5,
                  fillOpacity: 0.16,
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
      {props.district === "elm" &&
        RESIDENTS.map((r) => (
          <Marker
            key={`${r.id}-${markerState(r, props.resolved)}`}
            position={[r.lat, r.lng]}
            icon={dot(r, props.resolved)}
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
            <Tooltip permanent>Maria is on her way</Tooltip>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
