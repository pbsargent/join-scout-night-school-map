import { bbox } from "@turf/turf";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { LayerKey } from "../types/gis";

export function featureName(feature: Feature<Geometry>, layer: LayerKey): string {
  const properties = feature.properties ?? {};
  if (layer === "counties") return String(properties.label ?? properties.county_name ?? "County");
  return String(properties.district_name ?? properties.area_name ?? "District");
}

export function uniqueScoutingDistricts(collection: FeatureCollection<Geometry>) {
  const seen = new Map<string, Feature<Geometry>>();
  collection.features.forEach((feature) => {
    const name = String(feature.properties?.district_name ?? "Unlabeled area");
    if (!seen.has(name)) seen.set(name, feature);
  });
  return [...seen.entries()]
    .map(([name, feature]) => ({ name, feature }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function filterFeatures(
  collection: FeatureCollection<Geometry>,
  layer: LayerKey,
  query: string,
  coverage: "All" | "Full" | "Partial",
  minimumPercent: number,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return collection.features.filter((feature) => {
    const properties = feature.properties ?? {};
    const searchable = Object.values(properties).join(" ").toLocaleLowerCase();
    if (normalizedQuery && !searchable.includes(normalizedQuery)) return false;
    if (layer === "schools") {
      if (coverage !== "All" && properties.coverage !== coverage) return false;
      if (Number(properties.pct_district_in_council ?? 0) < minimumPercent) return false;
    }
    return true;
  });
}

export function boundsForFeature(feature: Feature<Geometry>): [[number, number], [number, number]] {
  const [west, south, east, north] = bbox(feature);
  return [
    [west, south],
    [east, north],
  ];
}

export function featuresToCsv(features: Feature<Geometry>[]) {
  const keys = [...new Set(features.flatMap((feature) => Object.keys(feature.properties ?? {})))];
  const escape = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [keys.join(","), ...features.map((feature) => keys.map((key) => escape(feature.properties?.[key])).join(","))].join("\n");
}

export function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
