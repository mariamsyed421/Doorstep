import {
  MercatorCoordinate,
  type CustomLayerInterface,
  type Map,
  type Marker,
  type Popup,
} from "maplibre-gl";
import { BUILDING_MIN_ZOOM } from "@/lib/response-map-layers";
import { projectRoofPoint, type MapPosition } from "@/lib/household-building-anchors";

export interface RoofMarker {
  marker: Marker;
  popup: Popup;
  position: MapPosition;
  height: number;
  world: MercatorCoordinate;
}

/**
 * MapLibre's DOM Marker API projects at ground level. Use its public custom-layer
 * Mercator matrix to lift existing accessible buttons and tooltips onto the roofs,
 * with the same camera and render frame as the actual building extrusions.
 * No WebGL geometry or private map APIs are needed.
 */
export function roofMarkerProjection(
  map: Map,
  markers: globalThis.Map<string, RoofMarker>,
): CustomLayerInterface {
  return {
    id: "household-roof-projection",
    type: "custom",
    renderingMode: "3d",
    render(_gl, { defaultProjectionData }) {
      const extruded =
        map.getZoom() >= BUILDING_MIN_ZOOM &&
        map.getLayer("response-buildings") &&
        map.getLayoutProperty("response-buildings", "visibility") !== "none";
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      for (const entry of markers.values()) {
        const element = entry.marker.getElement();
        let offset: MapPosition = [0, 0];
        if (extruded && entry.height > 0) {
          const roof = projectRoofPoint(
            entry.world,
            defaultProjectionData.mainMatrix,
            width,
            height,
          );
          if (!roof) {
            element.style.visibility = "hidden";
            continue;
          }
          const ground = map.project(entry.position);
          offset = [roof[0] - ground.x, roof[1] - ground.y];
        }
        element.style.visibility = "";
        const previous = entry.marker.getOffset();
        if (Math.abs(previous.x - offset[0]) > 0.01 || Math.abs(previous.y - offset[1]) > 0.01) {
          entry.marker.setOffset(offset);
          entry.popup.setOffset([offset[0], offset[1] - 18]);
        }
      }
    },
  };
}

export function roofMarker(
  marker: Marker,
  popup: Popup,
  position: MapPosition,
  height: number,
): RoofMarker {
  return {
    marker,
    popup,
    position,
    height,
    world: MercatorCoordinate.fromLngLat(position, height),
  };
}
