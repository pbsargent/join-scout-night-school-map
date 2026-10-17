"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap, MapMouseEvent, MapGeoJSONFeature } from "maplibre-gl";
import type { CouncilData, LayerKey, SelectedFeature, VisibilityState } from "../types/gis";
import { boundsForFeature } from "../lib/gis";
import { formatRecruitmentDate } from "../lib/display";
import { BoundaryCanvas } from "./BoundaryCanvas";

type Props = {
  data: CouncilData;
  visibility: VisibilityState;
  selected: SelectedFeature;
  coverage: "All" | "Full" | "Partial";
  minimumPercent: number;
  activeLayer: LayerKey;
  onSelect: (feature: SelectedFeature) => void;
};

const scoutingColor: ExpressionSpecification = [
  "match", ["get", "district_name"],
  "Armadillo", "#cf2f2f", "Bee Cave", "#2459c4", "Chisholm Trail", "#008272",
  "Colorado River", "#0076ad", "Hill Country", "#708800", "Live Oak", "#168b3a",
  "North Shore", "#5136b8", "Sacred Springs", "#008f98", "San Gabriel", "#8427a6",
  "Thunderbird", "#e06400", "#68736c",
];

const mapStyle = {
  version: 8 as const,
  sources: {},
  layers: [{
    id: "background",
    type: "background" as const,
    paint: { "background-color": "#e5efed" },
  }],
};

const boundaryInteractiveLayers = ["school-outline", "scouting-outline", "county-outline"];

function schoolAtPoint(map: MapLibreMap, data: CouncilData, point: { x: number; y: number }) {
  let nearest: SelectedFeature = null;
  let nearestDistance = 15;
  for (const feature of data.schoolPoints.features) {
    if (feature.geometry.type !== "Point") continue;
    const projected = map.project(feature.geometry.coordinates as [number, number]);
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (distance < nearestDistance) {
      nearest = feature;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function appendPopupRow(node: HTMLDivElement, label: string, value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return;
  const row = document.createElement("span");
  const key = document.createElement("b");
  key.textContent = `${label}: `;
  row.append(key, document.createTextNode(text));
  node.append(row);
}

function popupContent(properties: Record<string, unknown>) {
  const node = document.createElement("div");
  node.className = "map-popup";
  const heading = document.createElement("strong");
  heading.textContent = String(properties.school_name ?? properties.district_name ?? properties.label ?? properties.area_name ?? "Map feature");
  node.append(heading);
  if (properties.school_name) {
    appendPopupRow(node, "Status", properties.recruitment_status);
    appendPopupRow(node, "School district", properties.school_district);
    appendPopupRow(node, "Scouting district", properties.scouting_district);
    appendPopupRow(node, "Join Scout Night", formatRecruitmentDate(properties.jsn_date));
    appendPopupRow(node, "Unit", properties.unit);
    appendPopupRow(node, "Address", properties.address);
  } else {
    appendPopupRow(node, "Details", properties.coverage ?? properties.status);
  }
  return node;
}

function applyLayerFocus(map: MapLibreMap, activeLayer: LayerKey) {
  const countyActive = activeLayer === "counties";
  const scoutingActive = activeLayer === "scouting";
  const schoolActive = activeLayer === "schools";

  map.setPaintProperty("county-fill", "fill-opacity", countyActive ? 0.24 : 0.07);
  map.setPaintProperty("county-casing", "line-width", countyActive ? 5 : 3.1);
  map.setPaintProperty("county-outline", "line-width", countyActive ? 3.1 : 1.8);
  map.setPaintProperty("county-outline", "line-opacity", countyActive ? 1 : 0.88);
  map.setPaintProperty("scouting-fill", "fill-opacity", scoutingActive ? 0.38 : 0.08);
  map.setPaintProperty("scouting-casing", "line-width", scoutingActive ? 6 : 3.7);
  map.setPaintProperty("scouting-outline", "line-width", scoutingActive ? 3.7 : 2.1);
  map.setPaintProperty("scouting-outline", "line-opacity", scoutingActive ? 1 : 0.9);
  map.setPaintProperty("school-fill", "fill-opacity", schoolActive ? 0.38 : 0.08);
  map.setPaintProperty("school-casing", "line-width", schoolActive ? 4.2 : 2.7);
  map.setPaintProperty("school-outline", "line-width", schoolActive ? 2.35 : 1.45);
  map.setPaintProperty("school-outline", "line-opacity", schoolActive ? 1 : 0.86);

  const focusedOutlines = activeLayer === "counties"
    ? ["county-casing", "county-outline"]
    : activeLayer === "scouting"
      ? ["scouting-casing", "scouting-outline"]
      : ["school-casing", "school-outline"];
  focusedOutlines.forEach((layerId) => map.moveLayer(layerId, "council-outline"));
}

export function BoundaryMap({ data, visibility, selected, coverage, minimumPercent, activeLayer, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<{ remove: () => void } | null>(null);
  const visibilityRef = useRef(visibility);
  const coverageRef = useRef(coverage);
  const minimumPercentRef = useRef(minimumPercent);
  const activeLayerRef = useRef(activeLayer);
  const [overlayMap, setOverlayMap] = useState<MapLibreMap | null>(null);
  const [overlayRevision, setOverlayRevision] = useState(0);

  useEffect(() => {
    visibilityRef.current = visibility;
    coverageRef.current = coverage;
    minimumPercentRef.current = minimumPercent;
    activeLayerRef.current = activeLayer;
  }, [visibility, coverage, minimumPercent, activeLayer]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let disposed = false;
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !containerRef.current) return;
      const [west, south, east, north] = data.manifest.council_bounds;
      const map = new maplibregl.Map({
        container: containerRef.current,
        attributionControl: false,
        bounds: [[west, south], [east, north]],
        fitBoundsOptions: { padding: 96 },
        minZoom: 1,
        renderWorldCopies: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-right");
      map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
      // The canvas overlay is the authoritative council rendering, so show it
      // immediately even when Safari is still negotiating WebGL or base tiles.
      setOverlayMap(map);
      setOverlayRevision((value) => value + 1);

      // Keep the optional MapLibre basemap and vector layers independent from
      // the immediately rendered canvas overlay used by Safari.
      let councilLayersInitialized = false;
      const initializeCouncilLayers = () => {
        if (councilLayersInitialized) return;
        councilLayersInitialized = true;
        map.addSource("osm", {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        });
        map.addLayer({
          id: "osm",
          type: "raster",
          source: "osm",
          paint: {
            "raster-opacity": 0.36,
            "raster-saturation": -0.9,
            "raster-contrast": 0.12,
            "raster-brightness-min": 0.8,
            "raster-brightness-max": 1,
          },
        });
        const sources = {
          council: data.council,
          counties: data.counties,
          scouting: data.scouting,
          schoolDistricts: data.schoolDistricts,
          schoolPoints: data.schoolPoints,
        };
        Object.entries(sources).forEach(([id, collection]) => map.addSource(id, { type: "geojson", data: collection }));
        map.addSource("selected", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

        map.addLayer({ id: "county-fill", type: "fill", source: "counties", paint: { "fill-color": "#f7e4a3", "fill-opacity": 0.16 } });
        map.addLayer({ id: "county-casing", type: "line", source: "counties", paint: { "line-color": "#fffdf7", "line-width": 3.1, "line-opacity": 0.96 } });
        map.addLayer({ id: "county-outline", type: "line", source: "counties", paint: { "line-color": "#403827", "line-width": 1.8, "line-opacity": 0.88 } });
        map.addLayer({
          id: "school-fill",
          type: "fill",
          source: "schoolDistricts",
          paint: {
            "fill-color": ["match", ["get", "coverage"], "Full", "#54a889", "Partial", "#e4a33c", "#aeb6ad"],
            "fill-opacity": 0.34,
          },
        });
        map.addLayer({
          id: "school-casing",
          type: "line",
          source: "schoolDistricts",
          paint: { "line-color": "#fffdf7", "line-width": 2.7, "line-opacity": 0.92 },
        });
        map.addLayer({
          id: "school-outline",
          type: "line",
          source: "schoolDistricts",
          paint: {
            "line-color": ["match", ["get", "coverage"], "Full", "#1f6d58", "Partial", "#9a6114", "#68736c"],
            "line-width": 1.35,
            "line-dasharray": ["match", ["get", "coverage"], "Partial", ["literal", [3, 2]], ["literal", [1, 0]]],
          },
        });
        map.addLayer({
          id: "scouting-fill",
          type: "fill",
          source: "scouting",
          paint: {
            "fill-color": scoutingColor,
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({ id: "scouting-casing", type: "line", source: "scouting", paint: { "line-color": "#fffdf7", "line-width": 3.7, "line-opacity": 0.96 } });
        map.addLayer({ id: "scouting-outline", type: "line", source: "scouting", paint: { "line-color": scoutingColor, "line-width": 2, "line-opacity": 0.82 } });
        map.addLayer({ id: "council-outline", type: "line", source: "council", paint: { "line-color": "#102b22", "line-width": 5, "line-opacity": 1 } });
        map.addLayer({
          id: "school-points",
          type: "circle",
          source: "schoolPoints",
          paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 2.5, 10, 6], "circle-color": "#f7f3e8", "circle-stroke-color": "#22382f", "circle-stroke-width": 1.25 },
        });
        map.addLayer({ id: "selected-fill", type: "fill", source: "selected", filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], paint: { "fill-color": "#fff8c9", "fill-opacity": 0.28 } });
        map.addLayer({ id: "selected-line", type: "line", source: "selected", filter: ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]], paint: { "line-color": "#172f27", "line-width": 4 } });
        map.addLayer({ id: "selected-point", type: "circle", source: "selected", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 10, "circle-color": "#f4b340", "circle-stroke-color": "#172f27", "circle-stroke-width": 3 } });

        const initialVisibility: Array<[boolean, string[]]> = [
          [visibilityRef.current.counties, ["county-fill", "county-casing", "county-outline"]],
          [visibilityRef.current.scouting, ["scouting-fill", "scouting-casing", "scouting-outline"]],
          [visibilityRef.current.schoolDistricts, ["school-fill", "school-casing", "school-outline"]],
          [visibilityRef.current.schoolPoints, ["school-points"]],
        ];
        initialVisibility.forEach(([visible, ids]) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", visible ? "visible" : "none")));
        const initialClauses: unknown[] = [[">=", ["to-number", ["get", "pct_district_in_council"]], minimumPercentRef.current]];
        if (coverageRef.current !== "All") initialClauses.push(["==", ["get", "coverage"], coverageRef.current]);
        map.setFilter("school-fill", ["all", ...initialClauses] as never);
        map.setFilter("school-casing", ["all", ...initialClauses] as never);
        map.setFilter("school-outline", ["all", ...initialClauses] as never);
        applyLayerFocus(map, activeLayerRef.current);

        setOverlayMap(map);
        setOverlayRevision((value) => value + 1);
      };
      map.on("styledata", initializeCouncilLayers);
      map.setStyle(mapStyle);

      let animationFrame = 0;
      const refreshOverlay = () => {
        if (animationFrame) return;
        animationFrame = window.requestAnimationFrame(() => {
          animationFrame = 0;
          if (!disposed) setOverlayRevision((value) => value + 1);
        });
      };
      map.on("move", refreshOverlay);
      map.on("resize", refreshOverlay);

      map.on("click", (event: MapMouseEvent) => {
        const schoolFeature = visibilityRef.current.schoolPoints ? schoolAtPoint(map, data, event.point) : null;
        const boundaryFeature = map.queryRenderedFeatures(event.point, { layers: boundaryInteractiveLayers.filter((id) => map.getLayer(id)) })[0];
        const feature = (schoolFeature ?? boundaryFeature) as MapGeoJSONFeature | undefined;
        popupRef.current?.remove();
        if (!feature) {
          onSelect(null);
          return;
        }
        onSelect(feature);
        const properties = feature.properties ?? {};
        const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setLngLat(event.lngLat).setDOMContent(popupContent(properties)).addTo(map);
        popupRef.current = popup;
      });
      map.on("mousemove", (event: MapMouseEvent) => {
        const schoolHit = visibilityRef.current.schoolPoints && schoolAtPoint(map, data, event.point);
        const boundaryHits = map.queryRenderedFeatures(event.point, { layers: boundaryInteractiveLayers.filter((id) => map.getLayer(id)) });
        map.getCanvas().style.cursor = schoolHit || boundaryHits.length ? "pointer" : "";
      });
    });
    return () => {
      disposed = true;
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [data, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const groups: Array<[boolean, string[]]> = [
      [visibility.counties, ["county-fill", "county-casing", "county-outline"]],
      [visibility.scouting, ["scouting-fill", "scouting-casing", "scouting-outline"]],
      [visibility.schoolDistricts, ["school-fill", "school-casing", "school-outline"]],
      [visibility.schoolPoints, ["school-points"]],
    ];
    groups.forEach(([visible, ids]) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", visible ? "visible" : "none")));
  }, [visibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    const clauses: unknown[] = [[">=", ["to-number", ["get", "pct_district_in_council"]], minimumPercent]];
    if (coverage !== "All") clauses.push(["==", ["get", "coverage"], coverage]);
    const filter = ["all", ...clauses] as never;
    map.setFilter("school-fill", filter);
    map.setFilter("school-casing", filter);
    map.setFilter("school-outline", filter);
  }, [coverage, minimumPercent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded() || !map.getLayer("county-fill")) return;
    applyLayerFocus(map, activeLayer);
  }, [activeLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      const source = map.getSource("selected") as GeoJSONSource | undefined;
      source?.setData({ type: "FeatureCollection", features: selected ? [selected] : [] });
    }
    if (!selected) return;
    if (selected.geometry.type === "Point") {
      map.easeTo({
        center: selected.geometry.coordinates as [number, number],
        zoom: Math.max(map.getZoom(), 9),
        padding: { top: 70, bottom: 70, left: 70, right: window.innerWidth > 850 ? 430 : 70 },
        duration: 650,
      });
    } else {
      map.fitBounds(boundsForFeature(selected), { padding: 72, maxZoom: 11, duration: 650 });
    }
  }, [selected]);

  const showFullCouncil = () => {
    const map = mapRef.current;
    if (!map) return;
    const [west, south, east, north] = data.manifest.council_bounds;
    map.fitBounds([[west, south], [east, north]], { padding: 96, duration: 650 });
  };

  return (
    <div className="map-surface" aria-label="Interactive Capitol Area Council boundary map">
      <div ref={containerRef} className="map-canvas" />
      {overlayMap && (
        <>
          <BoundaryCanvas
            map={overlayMap}
            data={data}
            visibility={visibility}
            activeLayer={activeLayer}
            coverage={coverage}
            minimumPercent={minimumPercent}
            selected={selected}
            revision={overlayRevision}
          />
          {visibility.schoolPoints && (
            <div className="school-pin-layer" data-map-revision={overlayRevision}>
              {data.schoolPoints.features.map((feature, index) => {
                if (feature.geometry.type !== "Point") return null;
                const point = overlayMap.project(feature.geometry.coordinates as [number, number]);
                const schoolName = String(feature.properties?.school_name ?? `School ${index + 1}`);
                return (
                  <button
                    type="button"
                    className="school-pin-button"
                    style={{ left: point.x, top: point.y }}
                    aria-label={`Show full Join Scout Night information for ${schoolName}`}
                    title={schoolName}
                    onClick={(event) => {
                      event.stopPropagation();
                      popupRef.current?.remove();
                      onSelect(feature);
                    }}
                    key={`${schoolName}-${index}`}
                  />
                );
              })}
            </div>
          )}
        </>
      )}
      <button type="button" className="full-map-control" onClick={showFullCouncil}>View full council</button>
    </div>
  );
}
