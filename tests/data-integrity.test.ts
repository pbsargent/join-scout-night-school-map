import { readFile } from "node:fs/promises";
import { area, booleanPointInPolygon, difference, featureCollection } from "@turf/turf";
import { describe, expect, it } from "vitest";
import { enrichSchoolPoints } from "../src/hooks/useCouncilData";

async function load(filename: string) {
  return JSON.parse(await readFile(new URL(`../public/data/${filename}`, import.meta.url), "utf8"));
}

describe("generated council data", () => {
  it("contains all council counties and documented school districts", async () => {
    const [manifest, counties, schools] = await Promise.all([
      load("data-manifest.json"),
      load("CapitolAreaCouncil_Counties.geojson"),
      load("CapitolAreaCouncil_SchoolDistricts.geojson"),
    ]);
    expect(counties.features).toHaveLength(15);
    expect(counties.features.map((feature: { properties: { county_name: string } }) => feature.properties.county_name)).toEqual([
      "Bastrop", "Blanco", "Burnet", "Caldwell", "DeWitt", "Fayette", "Gillespie", "Gonzales",
      "Hays", "Lavaca", "Lee", "Llano", "Mason", "Travis", "Williamson",
    ]);
    expect(schools.features).toHaveLength(91);
    expect(manifest.counts.full_school_districts).toBe(43);
    expect(manifest.counts.partial_school_districts).toBe(48);
  });

  it("keeps generated coordinates within the Central Texas extent", async () => {
    const manifest = await load("data-manifest.json");
    const [west, south, east, north] = manifest.council_bounds;
    expect(west).toBeGreaterThan(-101);
    expect(east).toBeLessThan(-95);
    expect(south).toBeGreaterThan(27);
    expect(north).toBeLessThan(33);
  });

  it("excludes recruitment points outside the 15-county council polygon", async () => {
    const [council, schoolPoints] = await Promise.all([
      load("CapitolAreaCouncil.geojson"),
      load("CapitolAreaCouncil_Schools.geojson"),
    ]);
    expect(schoolPoints.features.length).toBeGreaterThan(0);
    expect(
      schoolPoints.features.every((feature: { geometry: { coordinates: [number, number] } }) =>
        booleanPointInPolygon(feature.geometry.coordinates, council.features[0]),
      ),
    ).toBe(true);
  });

  it("clips school and scouting polygons to the council service area", async () => {
    const [council, schoolDistricts, scoutingDistricts] = await Promise.all([
      load("CapitolAreaCouncil.geojson"),
      load("CapitolAreaCouncil_SchoolDistricts.geojson"),
      load("CapitolAreaCouncil_ScoutingDistricts.geojson"),
    ]);
    const polygonFeatures = [...schoolDistricts.features, ...scoutingDistricts.features];
    const outsideAreas = polygonFeatures.map((feature) => {
      const outside = difference(featureCollection([feature, council.features[0]]));
      return outside ? area(outside) : 0;
    });
    expect(Math.max(...outsideAreas)).toBeLessThan(0.1);
  });

  it("excludes Waterloo and Exploring from geographic district data", async () => {
    const [manifest, scoutingDistricts, schoolPoints] = await Promise.all([
      load("data-manifest.json"),
      load("CapitolAreaCouncil_ScoutingDistricts.geojson"),
      load("CapitolAreaCouncil_Schools.geojson"),
    ]);
    const excluded = new Set(["Waterloo", "Exploring", "Exploring / STEM"]);
    const schoolAssignments = schoolPoints.features.flatMap((feature: { properties: { scouting_district: string } }) =>
      feature.properties.scouting_district.split(/\s*,\s*/),
    );
    expect(manifest.scouting_district_names.every((name: string) => !excluded.has(name))).toBe(true);
    expect(scoutingDistricts.features.every((feature: { properties: { district_name: string } }) => !excluded.has(feature.properties.district_name))).toBe(true);
    expect(schoolAssignments.every((name: string) => !excluded.has(name))).toBe(true);
  });

  it("uses only Independent District Type schools", async () => {
    const [manifest, schoolPoints] = await Promise.all([
      load("data-manifest.json"),
      load("CapitolAreaCouncil_Schools.geojson"),
    ]);
    expect(manifest.notes).toContain(
      "Scouting regions and school points use only CAC Schools records whose District Type is Independent.",
    );
    expect(
      schoolPoints.features.every(
        (feature: { properties: { district_type: string } }) => feature.properties.district_type === "INDEPENDENT",
      ),
    ).toBe(true);
  });

  it("uses current CAC Schools assignments instead of the older council map", async () => {
    const [manifest, scoutingDistricts, schoolPoints] = await Promise.all([
      load("data-manifest.json"),
      load("CapitolAreaCouncil_ScoutingDistricts.geojson"),
      load("CapitolAreaCouncil_Schools.geojson"),
    ]);
    expect(manifest.counts.scouting_district_names).toBe(10);
    expect(manifest.counts.scouting_regions).toBe(10);
    expect(scoutingDistricts.features).toHaveLength(10);
    expect(scoutingDistricts.features.every((feature: { properties: { source: string } }) => feature.properties.source === "CAC Schools monday.com table")).toBe(true);
    expect(schoolPoints.features.every((feature: { properties: { source: string } }) => feature.properties.source.startsWith("CAC Schools monday.com table"))).toBe(true);
    expect(JSON.stringify({ manifest, scoutingDistricts })).not.toContain("Google My Map");
    expect(JSON.stringify({ manifest, scoutingDistricts })).not.toContain("Published reference boundary");
    const liveOak = scoutingDistricts.features.find((feature: { properties: { district_name: string } }) => feature.properties.district_name === "Live Oak");
    expect(liveOak.properties.school_districts).toContain("Yorktown ISD");
  });

  it("joins each mapped school to the latest full recruitment information", async () => {
    const [schoolPoints, recruitment] = await Promise.all([
      load("CapitolAreaCouncil_Schools.geojson"),
      readFile(new URL("../public/map-data.json", import.meta.url), "utf8").then(JSON.parse),
    ]);
    const enriched = enrichSchoolPoints(schoolPoints, recruitment);
    const lakeTravis = enriched.features.find((feature) => feature.properties?.school_name === "LAKE TRAVIS EL");
    expect(lakeTravis?.properties).toMatchObject({
      recruitment_status: "JSN Scheduled",
      approval_status: "Approved/Confirmed",
      administrator: "AMANDA PREHN",
      phone: "(512) 533-6300",
      location_type: "Cafeteria",
      unit: "Pack 0440",
    });
    expect(enriched.features.every((feature) => feature.properties?.recruitment_status)).toBe(true);
  });
});
