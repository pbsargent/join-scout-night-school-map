import { useEffect, useRef } from "react";
import type { Feature, Geometry, Position } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { CouncilData, LayerKey, SelectedFeature, VisibilityState } from "../types/gis";

type Props = {
  map: MapLibreMap | null;
  data: CouncilData;
  visibility: VisibilityState;
  activeLayer: LayerKey;
  coverage: "All" | "Full" | "Partial";
  minimumPercent: number;
  selected: SelectedFeature;
  revision: number;
};

const scoutingColors: Record<string, string> = {
  Armadillo: "#cf2f2f",
  "Bee Cave": "#2459c4",
  "Chisholm Trail": "#008272",
  "Colorado River": "#0076ad",
  "Hill Country": "#708800",
  "Live Oak": "#168b3a",
  "North Shore": "#5136b8",
  "Sacred Springs": "#008f98",
  "San Gabriel": "#8427a6",
  Thunderbird: "#e06400",
};

function traceRing(context: CanvasRenderingContext2D, map: MapLibreMap, ring: Position[]) {
  ring.forEach(([longitude, latitude], index) => {
    const point = map.project([longitude, latitude]);
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
}

function traceFeature(context: CanvasRenderingContext2D, map: MapLibreMap, feature: Feature<Geometry>) {
  const geometry = feature.geometry;
  context.beginPath();
  if (geometry.type === "Polygon") {
    geometry.coordinates.forEach((ring) => traceRing(context, map, ring));
    return true;
  }
  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygon) => polygon.forEach((ring) => traceRing(context, map, ring)));
    return true;
  }
  return false;
}

function drawFill(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  feature: Feature<Geometry>,
  color: string,
  opacity: number,
) {
  if (!traceFeature(context, map, feature)) return;
  context.globalAlpha = opacity;
  context.fillStyle = color;
  context.fill("evenodd");
  context.globalAlpha = 1;
}

function drawOutline(
  context: CanvasRenderingContext2D,
  map: MapLibreMap,
  feature: Feature<Geometry>,
  color: string,
  width: number,
  casingWidth: number,
  dash: number[] = [],
) {
  if (!traceFeature(context, map, feature)) return;
  context.setLineDash([]);
  context.strokeStyle = "rgba(255, 255, 255, 0.98)";
  context.lineWidth = casingWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
  context.setLineDash(dash);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
  context.setLineDash([]);
}

export function BoundaryCanvas({ map, data, visibility, activeLayer, coverage, minimumPercent, selected, revision }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;
    const width = map.getContainer().clientWidth;
    const height = map.getContainer().clientHeight;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const schools = data.schoolDistricts.features.filter((feature) => {
      const properties = feature.properties ?? {};
      if (coverage !== "All" && properties.coverage !== coverage) return false;
      return Number(properties.pct_district_in_council ?? 0) >= minimumPercent;
    });

    if (visibility.counties) {
      data.counties.features.forEach((feature) => drawFill(context, map, feature, "#f7e4a3", activeLayer === "counties" ? 0.2 : 0.055));
    }
    if (visibility.scouting) {
      data.scouting.features.forEach((feature) => {
        const color = scoutingColors[String(feature.properties?.district_name)] ?? "#59645e";
        drawFill(context, map, feature, color, activeLayer === "scouting" ? 0.3 : 0.045);
      });
    }
    if (visibility.schoolDistricts) {
      schools.forEach((feature) => {
        const full = feature.properties?.coverage === "Full";
        drawFill(context, map, feature, full ? "#54a889" : "#e4a33c", activeLayer === "schools" ? 0.26 : 0.04);
      });
    }

    const outlineOrder: LayerKey[] = (["counties", "scouting", "schools"] as LayerKey[])
      .filter((layer) => layer !== activeLayer)
      .concat(activeLayer);
    outlineOrder.forEach((layer) => {
      if (layer === "counties" && visibility.counties) {
        data.counties.features.forEach((feature) => drawOutline(context, map, feature, "#30291d", activeLayer === layer ? 3.5 : 2.1, activeLayer === layer ? 7 : 4.5));
      }
      if (layer === "scouting" && visibility.scouting) {
        data.scouting.features.forEach((feature) => {
          const color = scoutingColors[String(feature.properties?.district_name)] ?? "#35413b";
          drawOutline(context, map, feature, color, activeLayer === layer ? 4.2 : 2.6, activeLayer === layer ? 8.5 : 5.5);
        });
      }
      if (layer === "schools" && visibility.schoolDistricts) {
        schools.forEach((feature) => {
          const full = feature.properties?.coverage === "Full";
          drawOutline(context, map, feature, full ? "#145f4b" : "#8f5508", activeLayer === layer ? 2.8 : 1.7, activeLayer === layer ? 6 : 4, full ? [] : [6, 4]);
        });
      }
    });

    data.council.features.forEach((feature) => drawOutline(context, map, feature, "#0b281e", 5.2, 9.5));

    if (visibility.schoolPoints) {
      data.schoolPoints.features.forEach((feature) => {
        if (feature.geometry.type !== "Point") return;
        const point = map.project(feature.geometry.coordinates as [number, number]);
        context.beginPath();
        context.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
        context.fillStyle = "#fffdf7";
        context.fill();
        context.strokeStyle = "#102b22";
        context.lineWidth = 2;
        context.stroke();
      });
    }

    if (selected) {
      if (selected.geometry.type === "Point") {
        const point = map.project(selected.geometry.coordinates as [number, number]);
        context.beginPath();
        context.arc(point.x, point.y, 9, 0, Math.PI * 2);
        context.fillStyle = "#f4b340";
        context.fill();
        context.strokeStyle = "#172f27";
        context.lineWidth = 3;
        context.stroke();
      } else if (traceFeature(context, map, selected)) {
        context.globalAlpha = 0.2;
        context.fillStyle = "#fff3a8";
        context.fill("evenodd");
        context.globalAlpha = 1;
        context.strokeStyle = "#071d16";
        context.lineWidth = 5.5;
        context.stroke();
      }
    }
  }, [activeLayer, coverage, data, map, minimumPercent, revision, selected, visibility]);

  return <canvas ref={canvasRef} className="boundary-fallback-canvas" aria-hidden="true" />;
}
