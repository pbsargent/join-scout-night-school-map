import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import shapefile from "shapefile";
import proj4 from "proj4";
import {
  area,
  bbox,
  booleanPointInPolygon,
  centroid,
  featureCollection,
  intersect,
  simplify,
  union,
  voronoi,
} from "@turf/turf";

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputDirectory = path.join(projectRoot, "public", "data");

const sources = {
  schoolShape:
    process.env.SCHOOL_DISTRICT_SHP ||
    "/Users/petersargent/Downloads/schooldistricts_sy2526/SchoolDistricts_SY2526.shp",
  schoolCsv:
    process.env.SCHOOL_DISTRICT_CSV ||
    "/Users/petersargent/Downloads/CapitolAreaCouncil_SchoolDistricts.csv",
  countyShape:
    process.env.COUNTY_SHP ||
    "/tmp/cb_2025_us_county_500k/cb_2025_us_county_500k.shp",
  currentAssignments: path.join(projectRoot, "data", "cac-schools-current.json"),
  schoolPoints: path.join(projectRoot, "public", "map-data.json"),
};

const councilCountyNames = new Set([
  "Bastrop",
  "Blanco",
  "Burnet",
  "Caldwell",
  "DeWitt",
  "Fayette",
  "Gillespie",
  "Gonzales",
  "Hays",
  "Lavaca",
  "Lee",
  "Llano",
  "Mason",
  "Travis",
  "Williamson",
]);

const texasAlbers =
  "+proj=lcc +lat_1=27.41666666666667 +lat_2=34.91666666666666 +lat_0=31.16666666666667 +lon_0=-100 +x_0=1000000 +y_0=1000000 +datum=NAD83 +units=m +no_defs";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers, ...values] = rows;
  return values.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

function mapCoordinates(coordinates, transform) {
  if (typeof coordinates[0] === "number") return transform(coordinates);
  return coordinates.map((coordinate) => mapCoordinates(coordinate, transform));
}

function reprojectGeometry(geometry) {
  return {
    ...geometry,
    coordinates: mapCoordinates(geometry.coordinates, (coordinate) =>
      proj4(texasAlbers, "EPSG:4326", coordinate),
    ),
  };
}

async function readShape(filename, predicate = () => true, transform = (geometry) => geometry) {
  const collection = [];
  const source = await shapefile.open(filename);
  while (true) {
    const result = await source.read();
    if (result.done) break;
    if (!predicate(result.value)) continue;
    collection.push({
      type: "Feature",
      properties: result.value.properties,
      geometry: transform(result.value.geometry),
    });
  }
  return collection;
}

function safeIntersection(first, second) {
  try {
    return intersect(featureCollection([first, second]));
  } catch (error) {
    console.warn(`Intersection failed for ${first.properties?.district_name}: ${error.message}`);
    return null;
  }
}

function normalizeIdentity(value = "") {
  return String(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function schoolDistrictKey(value = "") {
  return normalizeIdentity(value)
    .replace(/\b(CONSOLIDATED|INDEPENDENT|SCHOOL|DISTRICT|CONS|CISD|ISD|CSD)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoutingDistrictNames(value = "") {
  return String(value).split(/\s*,\s*/).map((name) => name.trim()).filter((name) => name && name !== "Unassigned");
}

await mkdir(outputDirectory, { recursive: true });

const counties = await readShape(
  sources.countyShape,
  ({ properties }) =>
    properties.STATEFP === "48" && councilCountyNames.has(properties.NAME),
);

if (counties.length !== 15) {
  throw new Error(`Expected 15 counties; found ${counties.length}.`);
}

const countyFeatures = counties
  .map((feature) => ({
    ...feature,
    properties: {
      geoid: feature.properties.GEOID,
      county_name: feature.properties.NAME,
      label: `${feature.properties.NAME} County`,
      land_area_sq_km: Number((feature.properties.ALAND / 1_000_000).toFixed(2)),
      source: "U.S. Census Bureau 2025 Cartographic Boundary File",
    },
  }))
  .sort((a, b) => a.properties.county_name.localeCompare(b.properties.county_name));

const councilBoundary = union(featureCollection(countyFeatures));
councilBoundary.properties = {
  name: "Capitol Area Council",
  county_count: 15,
  area_sq_km: Number((area(councilBoundary) / 1_000_000).toFixed(2)),
  source: "Derived from U.S. Census Bureau 2025 county boundaries",
};

const csvRows = parseCsv(await readFile(sources.schoolCsv, "utf8"));
const assignmentSnapshot = JSON.parse(await readFile(sources.currentAssignments, "utf8"));
const allAssignments = assignmentSnapshot.assignments || [];
const currentAssignments = allAssignments.filter(
  (assignment) => normalizeIdentity(assignment.district_type) === "INDEPENDENT",
);
const assignmentBySchool = new Map(
  currentAssignments.map((assignment) => [
    `${normalizeIdentity(assignment.school_name)}|${normalizeIdentity(assignment.school_district)}`,
    assignment,
  ]),
);
const assignmentCountsBySchoolDistrict = new Map();
for (const assignment of currentAssignments) {
  const key = schoolDistrictKey(assignment.school_district);
  if (!key) continue;
  if (!assignmentCountsBySchoolDistrict.has(key)) assignmentCountsBySchoolDistrict.set(key, new Map());
  const counts = assignmentCountsBySchoolDistrict.get(key);
  for (const district of scoutingDistrictNames(assignment.scouting_district)) {
    counts.set(district, (counts.get(district) || 0) + 1);
  }
}

function schoolDistrictAssignmentSummary(districtName) {
  const counts = assignmentCountsBySchoolDistrict.get(schoolDistrictKey(districtName)) || new Map();
  const ranked = [...counts.entries()].sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]));
  return {
    scouting_district: ranked[0]?.[0] || "Unassigned",
    scouting_districts: ranked.map(([name]) => name).join(", ") || "Unassigned",
    assignment_school_count: ranked.reduce((total, [, count]) => total + count, 0),
    assignment_source: "CAC Schools monday.com table",
  };
}

const csvByGeoid = new Map(csvRows.map((row) => [row.GEOID20, row]));
const schoolGeoids = new Set(csvByGeoid.keys());
const schoolShapes = await readShape(
  sources.schoolShape,
  ({ properties }) => schoolGeoids.has(properties.GEOID20),
  reprojectGeometry,
);

const schoolDistricts = schoolShapes
  .map((feature) => {
    const csv = csvByGeoid.get(feature.properties.GEOID20);
    const simplified = simplify(feature, { tolerance: 0.00008, highQuality: true });
    const clipped = safeIntersection(simplified, councilBoundary);
    if (!clipped) return null;
    const calculatedArea = area(clipped) / 1_000_000;
    const center = centroid(clipped).geometry.coordinates;
    return {
      ...clipped,
      properties: {
        geoid: csv.GEOID20,
        district_name: csv.district_name,
        formal_name: csv.NAME20,
        short_name: csv.NAME2,
        district_number: csv.DISTRICT,
        nces_district: csv.NCES_DISTR,
        coverage: csv.coverage,
        pct_district_in_council: Number(csv.pct_district_in_council),
        council_counties: csv.council_counties,
        area_in_council_sq_km: Number(calculatedArea.toFixed(4)),
        label_longitude: Number(center[0].toFixed(6)),
        label_latitude: Number(center[1].toFixed(6)),
        source: "Texas Education Agency School Districts SY 2025–26",
        ...schoolDistrictAssignmentSummary(csv.district_name),
      },
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.properties.district_name.localeCompare(b.properties.district_name));

if (schoolDistricts.length !== csvRows.length) {
  throw new Error(`Expected ${csvRows.length} school districts; generated ${schoolDistricts.length}.`);
}

const pointPayload = JSON.parse(await readFile(sources.schoolPoints, "utf8"));
const pointRows = Array.isArray(pointPayload) ? pointPayload : pointPayload.schools || [];
const schoolPoints = pointRows
  .filter((school) => Number.isFinite(school.lat) && Number.isFinite(school.lon))
  .filter((school) => booleanPointInPolygon([school.lon, school.lat], councilBoundary))
  .filter((school) => assignmentBySchool.has(`${normalizeIdentity(school.name)}|${normalizeIdentity(school.schoolDistrict)}`))
  .map((school, index) => ({
    type: "Feature",
    id: `school-${index + 1}`,
    geometry: { type: "Point", coordinates: [school.lon, school.lat] },
    properties: {
      monday_item_id: assignmentBySchool.get(`${normalizeIdentity(school.name)}|${normalizeIdentity(school.schoolDistrict)}`)?.monday_item_id || "",
      district_type: "INDEPENDENT",
      school_name: school.name,
      school_district: school.schoolDistrict,
      scouting_district: assignmentBySchool.get(`${normalizeIdentity(school.name)}|${normalizeIdentity(school.schoolDistrict)}`)?.scouting_district || "Unassigned",
      county: school.county,
      address: school.address,
      recruitment_status: school.status,
      jsn_date: school.jsnDate,
      youth_talk_date: school.youthTalkDate,
      approval_status: school.approval,
      staff: school.staff,
      unit: school.units,
      grades: school.grades,
      location_type: school.locationType,
      administrator: school.administrator,
      phone: school.phone,
      website: school.website,
      nces_id: school.ncesId,
      source: "CAC Schools monday.com table, joined to mapped recruitment-school coordinates",
    },
  }));

const assignedSchoolPoints = schoolPoints.filter((feature) => feature.properties.scouting_district !== "Unassigned");
const districtCells = [];
for (const schoolDistrict of schoolDistricts) {
  const districtNames = scoutingDistrictNames(schoolDistrict.properties.scouting_districts);
  if (!districtNames.length) continue;

  const schoolDistrictPoints = assignedSchoolPoints.filter(
    (school) => schoolDistrictKey(school.properties.school_district) === schoolDistrictKey(schoolDistrict.properties.district_name),
  );
  const representedNames = [...new Set(schoolDistrictPoints.map((school) => school.properties.scouting_district))]
    .filter((districtName) => districtNames.includes(districtName));

  if (representedNames.length < 2) {
    districtCells.push({
      ...schoolDistrict,
      properties: { district_name: districtNames[0] },
    });
    continue;
  }

  const tessellation = voronoi(featureCollection(schoolDistrictPoints), { bbox: bbox(schoolDistrict) });
  for (const cell of tessellation?.features || []) {
    if (!cell?.properties?.scouting_district) continue;
    const clippedCell = safeIntersection(cell, schoolDistrict);
    if (!clippedCell) continue;
    districtCells.push({
      ...clippedCell,
      properties: { district_name: cell.properties.scouting_district },
    });
  }
}

if (!districtCells.length) throw new Error("Could not derive scouting district regions from current school-district assignments.");
const cellsByDistrict = new Map();
for (const cell of districtCells) {
  const districtName = cell.properties.district_name;
  if (!cellsByDistrict.has(districtName)) cellsByDistrict.set(districtName, []);
  cellsByDistrict.get(districtName).push(cell);
}
const dissolvedDistricts = featureCollection(
  [...cellsByDistrict.entries()].map(([districtName, cells]) => {
    const merged = union(featureCollection(cells));
    merged.properties = { district_name: districtName };
    return merged;
  }),
);
const scoutingDistricts = dissolvedDistricts.features
  .map((feature, index) => {
    const clipped = safeIntersection(feature, councilBoundary);
    if (!clipped) return null;
    const districtName = feature.properties.district_name;
    const matchingAssignments = currentAssignments.filter((assignment) => scoutingDistrictNames(assignment.scouting_district).includes(districtName));
    const matchingSchoolDistricts = schoolDistricts.filter((district) =>
      scoutingDistrictNames(district.properties.scouting_districts).includes(districtName),
    );
    return {
      ...clipped,
      id: `scouting-${index + 1}`,
      properties: {
        district_name: districtName,
        status: "Current assignment-derived planning region",
        derivation: "Assigned school-district polygons, subdivided by mapped schools only where a district spans multiple scouting districts",
        assignment_school_count: matchingAssignments.length,
        school_district_count: matchingSchoolDistricts.length,
        school_districts: matchingSchoolDistricts.map((district) => district.properties.district_name).sort().join(", "),
        source: "CAC Schools monday.com table",
        source_updated_at: assignmentSnapshot.board_updated_at,
      },
    };
  })
  .filter(Boolean)
  .sort((first, second) => first.properties.district_name.localeCompare(second.properties.district_name));

const files = {
  "CapitolAreaCouncil.geojson": featureCollection([councilBoundary]),
  "CapitolAreaCouncil_Counties.geojson": featureCollection(countyFeatures),
  "CapitolAreaCouncil_SchoolDistricts.geojson": featureCollection(schoolDistricts),
  "CapitolAreaCouncil_ScoutingDistricts.geojson": featureCollection(scoutingDistricts),
  "CapitolAreaCouncil_Schools.geojson": featureCollection(schoolPoints),
};

for (const [filename, data] of Object.entries(files)) {
  await writeFile(path.join(outputDirectory, filename), `${JSON.stringify(data)}\n`);
}

const scoutingNames = [...new Set(scoutingDistricts.map((feature) => feature.properties.district_name))].sort();
const manifest = {
  generated_at: new Date().toISOString(),
  service_area_since: 1912,
  council_bounds: bbox(councilBoundary),
  counts: {
    counties: countyFeatures.length,
    school_districts: schoolDistricts.length,
    full_school_districts: schoolDistricts.filter((feature) => feature.properties.coverage === "Full").length,
    partial_school_districts: schoolDistricts.filter((feature) => feature.properties.coverage === "Partial").length,
    scouting_district_names: scoutingNames.length,
    scouting_regions: scoutingDistricts.length,
    schools: schoolPoints.length,
    assigned_schools: assignedSchoolPoints.length,
    unassigned_schools: schoolPoints.length - assignedSchoolPoints.length,
  },
  scouting_district_names: scoutingNames,
  notes: [
    "Scouting regions and school points use only CAC Schools records whose District Type is Independent.",
    "The 2021 council district map is not used.",
    "Waterloo and Exploring are excluded because they are not geographic scouting districts.",
    "Scouting regions follow assigned school-district polygons; districts with multiple scouting assignments are subdivided using mapped schools.",
    "Derived scouting regions are planning aids, not legal boundaries.",
    "Scouting and school district polygons are clipped to the 15-county council boundary.",
    "Recruitment school points outside the 15-county council boundary are excluded.",
  ],
  sources: {
    counties: "https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip",
    school_districts: "https://data.capitol.texas.gov/dataset/school-districts",
    scouting_districts: assignmentSnapshot.board_url,
  },
};
await writeFile(
  path.join(outputDirectory, "data-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);

console.log(JSON.stringify(manifest, null, 2));
