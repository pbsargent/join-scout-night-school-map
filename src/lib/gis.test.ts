import { describe, expect, it } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import { boundsForFeature, featuresToCsv, filterFeatures } from "./gis";

const collection: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { district_name: "Austin ISD", coverage: "Full", pct_district_in_council: 100, council_counties: "Travis, Hays" },
      geometry: { type: "Polygon", coordinates: [[[-98, 30], [-97, 30], [-97, 31], [-98, 31], [-98, 30]]] },
    },
    {
      type: "Feature",
      properties: { district_name: "Bartlett ISD", coverage: "Partial", pct_district_in_council: 34, council_counties: "Williamson" },
      geometry: { type: "Polygon", coordinates: [[[-98.2, 30.2], [-98.1, 30.2], [-98.1, 30.3], [-98.2, 30.3], [-98.2, 30.2]]] },
    },
  ],
};

describe("GIS helpers", () => {
  it("combines search, coverage, and percent filters", () => {
    expect(filterFeatures(collection, "schools", "bartlett", "Partial", 30)).toHaveLength(1);
    expect(filterFeatures(collection, "schools", "", "Partial", 40)).toHaveLength(0);
  });

  it("computes feature bounds from geometry", () => {
    expect(boundsForFeature(collection.features[0])).toEqual([[-98, 30], [-97, 31]]);
  });

  it("escapes commas in CSV exports", () => {
    const csv = featuresToCsv(collection.features);
    expect(csv).toContain('"Travis, Hays"');
    expect(csv.split("\n")).toHaveLength(3);
  });
});
