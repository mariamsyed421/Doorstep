import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Box, Crosshair, Minus, Plus } from "lucide-react";
import {
  Map as GLMap,
  Marker,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type StyleSpecification,
} from "maplibre-gl";
import type { FeatureCollection, Polygon } from "geojson";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { Button } from "@/components/ui/button";
import {
  DISTRICTS,
  RESIDENTS,
  districtCount,
  markerState,
  urgency,
  type Resolutions,
} from "@/lib/doorstep-data";
import { TEXAS_BOUNDS } from "@/lib/texas-boundary";
import {
  boundsCenter,
  coordinateBounds,
  countyAt,
  countyBounds,
  mapPadding,
  type Counties,
  type County,
  type MapBounds,
} from "@/lib/response-map-geometry";
import { addResponseLayers, BUILDING_MIN_ZOOM, EMPTY_COLLECTION } from "@/lib/response-map-layers";

setWorkerUrl(workerUrl);

interface Props {
  district: string | null;
  resolved: Resolutions;
  selected: string | null;
  walking: string | null;
  onDistrict: (id: string | null) => void;
  onSelect: (id: string) => void;
}

type BuildingStatus = "overview" | "zoom" | "loading" | "available" | "empty" | "unavailable";
const statusText: Record<BuildingStatus, string> = {
  overview: "Select a county to explore",
  zoom: "Zoom in for 3D buildings",
  loading: "Loading visible building tiles…",
  available: "3D buildings · mapped footprints",
  empty: "No building footprints here · basemap shown",
  unavailable: "3D buildings unavailable · basemap shown",
};
const initialBounds: MapBounds = [
  [TEXAS_BOUNDS[0][1], TEXAS_BOUNDS[0][0]],
  [TEXAS_BOUNDS[1][1], TEXAS_BOUNDS[1][0]],
];
const cityBounds = coordinateBounds(
  DISTRICTS.flatMap((d) => d.polygon.map(([lat, lng]) => [lng, lat])),
);
const fallbackStyle: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#f1f2f3" } }],
};
const colors = { red: "#c82018", orange: "#956008", amber: "#edb34c", quiet: "#767d85" };
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function markerButton(label: string, className: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.setAttribute("aria-label", label);
  return button;
}

function tooltipContent(title: string, detail: string) {
  const content = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  content.append(strong, document.createElement("br"), document.createTextNode(detail));
  return content;
}

function tooltip(
  map: GLMap,
  element: HTMLElement,
  position: [number, number],
  content: HTMLElement,
  permanent = false,
) {
  const popup = new Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 18,
    maxWidth: "270px",
  })
    .setLngLat(position)
    .setDOMContent(content);
  const show = () => popup.addTo(map);
  const hide = () => {
    if (!permanent) popup.remove();
  };
  element.addEventListener("mouseenter", show);
  element.addEventListener("focus", show);
  element.addEventListener("mouseleave", hide);
  element.addEventListener("blur", hide);
  if (permanent) show();
  return popup;
}

export default function ResponseMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GLMap | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const countiesRef = useRef<Counties | null>(null);
  const countyRef = useRef<County | null>(null);
  const boundsRef = useRef(initialBounds);
  const skipDistrictReset = useRef(false);
  const previousDistrict = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [counties, setCounties] = useState<Counties | null>(null);
  const [county, setCounty] = useState<County | null>(null);
  const [overview, setOverview] = useState(true);
  const [tilted, setTilted] = useState(false);
  const [buildingStatus, setBuildingStatus] = useState<BuildingStatus>("overview");
  const [countyError, setCountyError] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileWarning, setTileWarning] = useState(false);

  const countyOptions = useMemo(
    () =>
      counties
        ? [...counties.features].sort((a, b) => a.properties.NAME.localeCompare(b.properties.NAME))
        : [],
    [counties],
  );

  const setSelection = useCallback((next: County | null) => {
    const map = mapRef.current;
    if (map?.getSource("texas-counties")) {
      if (countyRef.current)
        map.setFeatureState(
          { source: "texas-counties", id: countyRef.current.properties.GEOID },
          { selected: false },
        );
      if (next)
        map.setFeatureState(
          { source: "texas-counties", id: next.properties.GEOID },
          { selected: true },
        );
    }
    countyRef.current = next;
    setCounty(next);
    if (map) {
      if (next) {
        map.dragRotate.enable();
        map.touchZoomRotate.enableRotation();
        map.touchPitch.enable();
      } else {
        map.dragRotate.disable();
        map.touchZoomRotate.disableRotation();
        map.touchPitch.disable();
      }
      if (map.getLayer("response-buildings"))
        map.setLayoutProperty("response-buildings", "visibility", next ? "visible" : "none");
    }
  }, []);

  const fit = useCallback((bounds: MapBounds, pitch: number, maxZoom = 19, animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    const { clientWidth, clientHeight } = map.getContainer();
    map.stop();
    map.fitBounds(bounds, {
      padding: mapPadding(clientWidth, clientHeight),
      pitch,
      bearing: 0,
      maxZoom,
      duration: animate && !reducedMotion() ? 1400 : 0,
    });
  }, []);

  const clearDistrict = useCallback(() => {
    if (latest.current.district) {
      skipDistrictReset.current = true;
      latest.current.onDistrict(null);
    }
  }, []);

  const returnToTexas = useCallback(() => {
    setSelection(null);
    clearDistrict();
    fit(boundsRef.current, 0);
  }, [clearDistrict, fit, setSelection]);

  const selectCounty = useCallback(
    (next: County) => {
      setSelection(next);
      clearDistrict();
      // Framing is calculated from every polygon part, including coastal islands.
      fit(countyBounds(next), 50, 12);
    },
    [clearDistrict, fit, setSelection],
  );

  useEffect(() => {
    const abort = new AbortController();
    fetch(`${import.meta.env.BASE_URL}geo/texas-counties.geojson`, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error("County boundaries unavailable");
        return response.json() as Promise<Counties>;
      })
      .then((data) => {
        if (
          data.type !== "FeatureCollection" ||
          data.features.length !== 254 ||
          !data.features.every(
            (f) =>
              /^48\d{3}$/.test(f.properties.GEOID) &&
              (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon"),
          )
        ) {
          throw new Error("Invalid county boundaries");
        }
        if (abort.signal.aborted) return;
        countiesRef.current = data;
        boundsRef.current = coordinateBounds(
          data.features.flatMap((feature) => countyBounds(feature)),
        );
        setCounties(data);
      })
      .catch(() => {
        if (!abort.signal.aborted) setCountyError(true);
      });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (!container.current) return;
    let map: GLMap;
    try {
      map = new GLMap({
        container: container.current,
        style: "https://tiles.openfreemap.org/styles/positron",
        bounds: initialBounds,
        fitBoundsOptions: {
          padding: mapPadding(container.current.clientWidth, container.current.clientHeight),
        },
        minZoom: 2,
        maxZoom: 19,
        maxPitch: 60,
        pitch: 0,
        bearing: 0,
        renderWorldCopies: false,
        dragRotate: false,
        touchPitch: false,
        attributionControl: {
          compact: true,
          customAttribution: "County boundaries: U.S. Census Bureau",
        },
      });
    } catch {
      setMapError("The map could not start. Check that WebGL is enabled in your browser.");
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    let active = true;
    let hover: { source: string; id: string | number } | null = null;
    const hoverPopup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 });

    const clearHover = () => {
      if (hover && map.getSource(hover.source)) map.setFeatureState(hover, { hover: false });
      hover = null;
      hoverPopup.remove();
      map.getCanvas().style.cursor = "";
    };
    const hitAt = (event: MapMouseEvent) => {
      const layers = ["response-district-fill", "county-fill"].filter((id) => map.getLayer(id));
      return layers.length ? map.queryRenderedFeatures(event.point, { layers })[0] : undefined;
    };
    const onHover = (event: MapMouseEvent) => {
      const hit = hitAt(event);
      if (
        !hit ||
        hit.id === undefined ||
        (hit.source === "texas-counties" && map.getZoom() >= 12)
      ) {
        clearHover();
        return;
      }
      if (hover?.id !== hit.id || hover?.source !== hit.source) {
        clearHover();
        hover = { source: hit.source, id: hit.id };
        map.setFeatureState(hover, { hover: true });
        const title =
          hit.source === "texas-counties"
            ? String(hit.properties["NAME"])
            : String(hit.properties["name"]);
        const detail =
          hit.source === "texas-counties"
            ? "Click to explore"
            : `${hit.properties["count"]} silent at home · ${hit.properties["alone"]} live alone`;
        hoverPopup.setDOMContent(tooltipContent(title, detail)).addTo(map);
      }
      hoverPopup.setLngLat(event.lngLat);
      map.getCanvas().style.cursor = "pointer";
    };
    const onClick = (event: MapMouseEvent) => {
      const hit = hitAt(event);
      if (!hit) return;
      clearHover();
      if (hit.source === "response-districts") {
        latest.current.onDistrict(String(hit.properties["district"]));
      } else {
        const next = countiesRef.current?.features.find(
          (feature) => feature.properties.GEOID === hit.id,
        );
        // Clicking streets inside the active county must not reset the camera.
        if (next && next.properties.GEOID !== countyRef.current?.properties.GEOID)
          selectCounty(next);
      }
    };
    const syncView = () => {
      setOverview(map.getZoom() < 10);
      setTilted(map.getPitch() > 5);
      if (!countyRef.current) setBuildingStatus("overview");
      else if (!map.getLayer("response-buildings")) setBuildingStatus("unavailable");
      else if (map.getZoom() < BUILDING_MIN_ZOOM) setBuildingStatus("zoom");
      else if (!map.areTilesLoaded()) setBuildingStatus("loading");
      else
        setBuildingStatus(
          map.queryRenderedFeatures({ layers: ["response-buildings"] }).length
            ? "available"
            : "empty",
        );
    };
    const onLoad = () => {
      if (!active) return;
      addResponseLayers(map);
      setReady(true);
      syncView();
    };
    const onError = () => {
      if (!active) return;
      setTileWarning(true);
      // A failed style request must not prevent the local county map from loading.
      if (!map.getStyle()) map.setStyle(fallbackStyle);
    };
    const onResize = () => {
      if (!countyRef.current && !latest.current.district && map.getZoom() < 10)
        fit(boundsRef.current, 0, 19, false);
    };
    map.on("load", onLoad);
    map.on("error", onError);
    map.on("mousemove", onHover);
    map.on("click", onClick);
    map.on("zoomend", syncView);
    map.on("pitchend", syncView);
    map.on("idle", syncView);
    map.on("resize", onResize);
    map.getCanvas().addEventListener("mouseleave", clearHover);
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);
    return () => {
      active = false;
      resize.disconnect();
      hoverPopup.remove();
      map.getCanvas().removeEventListener("mouseleave", clearHover);
      map.remove();
      mapRef.current = null;
    };
  }, [fit, selectCounty]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !counties) return;
    (map.getSource("texas-counties") as GeoJSONSource).setData(counties);
    if (!countyRef.current && !latest.current.district) fit(boundsRef.current, 0, 19, false);
  }, [counties, fit, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !counties) return;
    const wasDistrict = previousDistrict.current;
    previousDistrict.current = props.district;
    if (!props.district) {
      if (skipDistrictReset.current) skipDistrictReset.current = false;
      else if (wasDistrict) returnToTexas();
      return;
    }
    const district = DISTRICTS.find((item) => item.id === props.district);
    if (!district) return;
    const bounds =
      props.district === "elm"
        ? coordinateBounds(RESIDENTS.map((r) => [r.lng, r.lat]))
        : coordinateBounds(district.polygon.map(([lat, lng]) => [lng, lat]));
    setSelection(countyAt(counties, boundsCenter(bounds)) ?? null);
    fit(bounds, 50, props.district === "elm" ? 19 : 15);
  }, [counties, fit, props.district, ready, returnToTexas, setSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("response-density") as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: DISTRICTS.map((district) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: boundsCenter(
            coordinateBounds(district.polygon.map(([lat, lng]) => [lng, lat])),
          ),
        },
        properties: { count: districtCount(district, props.resolved) },
      })),
    });
    const districts: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features:
        props.district === "elm"
          ? []
          : DISTRICTS.map((district, i) => {
              const coordinates = district.polygon.map(([lat, lng]) => [lng, lat]);
              return {
                type: "Feature",
                id: i,
                geometry: { type: "Polygon", coordinates: [[...coordinates, coordinates[0]!]] },
                properties: {
                  district: district.id,
                  name: district.name,
                  count: districtCount(district, props.resolved),
                  alone: district.liveAloneSilent,
                  color: colors[urgency(districtCount(district, props.resolved))],
                },
              };
            }),
    };
    (map.getSource("response-districts") as GeoJSONSource).setData(districts);
  }, [props.district, props.resolved, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || props.district === "elm") return;
    const markers: Marker[] = [];
    const popups: Popup[] = [];
    if (overview) {
      const element = markerButton(
        "Explore Richardson response neighborhoods",
        "region-name-marker",
      );
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      title.textContent = "Richardson, TX";
      detail.textContent = "9 neighborhoods · Explore →";
      element.append(title, detail);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        const next = countiesRef.current && countyAt(countiesRef.current, boundsCenter(cityBounds));
        if (next) setSelection(next);
        fit(cityBounds, 50, 13.8);
      });
      markers.push(
        new Marker({ element, anchor: "top", offset: [0, 22] })
          .setLngLat([-96.745, 32.9539])
          .addTo(map),
      );
    } else {
      DISTRICTS.forEach((district) => {
        const count = districtCount(district, props.resolved);
        const position = boundsCenter(
          coordinateBounds(district.polygon.map(([lat, lng]) => [lng, lat])),
        );
        const element = markerButton(
          `${district.name}, ${count} silent at home`,
          "district-name-marker",
        );
        const name = document.createElement("span");
        const value = document.createElement("b");
        name.textContent = district.name;
        value.textContent = String(count);
        element.append(name, value);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          latest.current.onDistrict(district.id);
        });
        markers.push(new Marker({ element }).setLngLat(position).addTo(map));
        popups.push(
          tooltip(
            map,
            element,
            position,
            tooltipContent(
              district.name,
              `${count} silent at home · ${district.liveAloneSilent} live alone`,
            ),
          ),
        );
      });
    }
    return () => {
      markers.forEach((m) => m.remove());
      popups.forEach((p) => p.remove());
    };
  }, [fit, overview, props.district, props.resolved, ready, setSelection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || props.district !== "elm") return;
    const popups: Popup[] = [];
    const markers = RESIDENTS.map((resident) => {
      const state = markerState(resident, props.resolved);
      const element = markerButton(`${resident.name}, ${resident.address}`, "household-marker");
      const dot = document.createElement("span");
      dot.className = `porch-dot ${state}`;
      dot.textContent = state === "unknown" ? "?" : state === "away" ? "↗" : "";
      element.append(dot);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        latest.current.onSelect(resident.id);
      });
      const position: [number, number] = [resident.lng, resident.lat];
      const marker = new Marker({ element }).setLngLat(position).addTo(map);
      popups.push(
        tooltip(
          map,
          element,
          position,
          tooltipContent(`${resident.shortName} · ${resident.address}`, `“${resident.planQuote}”`),
          props.selected === resident.id,
        ),
      );
      return marker;
    });
    return () => {
      markers.forEach((m) => m.remove());
      popups.forEach((p) => p.remove());
    };
  }, [props.district, props.resolved, props.selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const resident = RESIDENTS.find((r) => r.id === props.walking);
    const source = map.getSource("walking-route") as GeoJSONSource;
    if (!resident) {
      source.setData(EMPTY_COLLECTION);
      return;
    }
    const position: [number, number] = [resident.neighbor.lng, resident.neighbor.lat];
    source.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [position, [resident.lng, resident.lat]] },
    });
    const element = markerButton(`${resident.neighbor.name} is on the way`, "walking-marker");
    element.textContent = "↟";
    const marker = new Marker({ element }).setLngLat(position).addTo(map);
    const popup = tooltip(
      map,
      element,
      position,
      tooltipContent(resident.neighbor.name, "On the way"),
      true,
    );
    let frame = 0;
    const timer = reducedMotion()
      ? undefined
      : window.setInterval(() => {
          frame = (frame + 1) % 7;
          map.setPaintProperty("walking-route", "line-dasharray", [frame / 2, 4, 3 - frame / 2]);
        }, 120);
    return () => {
      window.clearInterval(timer);
      marker.remove();
      popup.remove();
    };
  }, [props.walking, ready]);

  return (
    <div className="county-map relative h-full w-full">
      <div
        ref={container}
        className="response-map"
        aria-label="Interactive Texas county and neighborhood map"
      />
      <div className="county-map-toolbar map-float left-5 top-[88px] flex max-w-[calc(100%-40px)] flex-wrap items-center gap-2 p-2">
        <select
          aria-label="Select a Texas county"
          className="county-map-select min-h-8 min-w-0 flex-1 rounded-md bg-transparent px-2 text-xs font-semibold outline-offset-2"
          disabled={!ready || !counties}
          value={county?.properties.GEOID ?? ""}
          onChange={(event) => {
            const next = counties?.features.find(
              (feature) => feature.properties.GEOID === event.target.value,
            );
            if (next) selectCounty(next);
            else returnToTexas();
          }}
        >
          <option value="">
            {countyError
              ? "County boundaries unavailable"
              : !counties
                ? "Loading counties…"
                : "Texas · 254 counties"}
          </option>
          {countyOptions.map((feature) => (
            <option key={feature.properties.GEOID} value={feature.properties.GEOID}>
              {feature.properties.NAME}
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="sm"
          onClick={returnToTexas}
          disabled={!ready}
          aria-label="Return to full Texas county view"
          title="Return to full Texas county view"
          className="h-8 gap-1 px-2 text-xs"
        >
          <ArrowLeft /> Texas
        </Button>
        <p className="basis-full px-2 pb-1 text-[10px] text-muted-foreground" role="status">
          {countyError
            ? "County boundaries could not load. Existing response layers remain available."
            : statusText[buildingStatus]}
        </p>
      </div>
      <div className="map-float bottom-16 right-5 flex flex-col p-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={!ready}
          onClick={() => mapRef.current?.zoomIn({ duration: reducedMotion() ? 0 : 300 })}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={!ready}
          onClick={() => mapRef.current?.zoomOut({ duration: reducedMotion() ? 0 : 300 })}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={tilted ? "Switch to flat map" : "Switch to tilted map"}
          title={tilted ? "Switch to flat map" : "Switch to tilted map"}
          aria-pressed={tilted}
          disabled={!ready || !county}
          onClick={() =>
            mapRef.current?.easeTo({ pitch: tilted ? 0 : 50, duration: reducedMotion() ? 0 : 600 })
          }
        >
          <Box />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reset map to Texas"
          title="Reset map to Texas"
          disabled={!ready}
          onClick={returnToTexas}
        >
          <Crosshair />
        </Button>
      </div>
      {tileWarning && (
        <p
          className="map-float bottom-1 left-1/2 w-max max-w-[calc(100%-32px)] -translate-x-1/2 px-3 py-1 text-center text-[10px] text-muted-foreground"
          role="status"
        >
          Some basemap tiles are unavailable. County boundaries remain available.
        </p>
      )}
      {mapError && (
        <p
          className="absolute inset-0 grid place-items-center bg-card p-8 text-center text-sm text-muted-foreground"
          role="alert"
        >
          {mapError}
        </p>
      )}
    </div>
  );
}
