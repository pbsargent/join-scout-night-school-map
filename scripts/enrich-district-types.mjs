import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const classificationInspectPath = process.argv[2];
const assignmentPath = path.join(projectRoot, "data", "cac-schools-current.json");

if (!classificationInspectPath) {
  throw new Error("Pass the classification workbook inspect NDJSON path.");
}

const inspectionRecords = (await readFile(classificationInspectPath, "utf8"))
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const schoolReview = inspectionRecords.find(
  (record) =>
    record.kind === "table" &&
    record.sheet === "School Review" &&
    Array.isArray(record.values) &&
    record.values.some((row) => row?.[0] === "School Item ID"),
);

if (!schoolReview) throw new Error("School Review table was not found in the workbook inspection.");

const headerIndex = schoolReview.values.findIndex((row) => row?.[0] === "School Item ID");
const headers = schoolReview.values[headerIndex];
const itemIdIndex = headers.indexOf("School Item ID");
const districtTypeIndex = headers.indexOf("District Type Raw");
if (itemIdIndex < 0 || districtTypeIndex < 0) {
  throw new Error("Required School Item ID or District Type Raw column was not found.");
}

const districtTypeByItemId = new Map(
  schoolReview.values.slice(headerIndex + 1).map((row) => [
    String(row?.[itemIdIndex] ?? "").trim(),
    String(row?.[districtTypeIndex] ?? "").trim().toUpperCase(),
  ]),
);

const snapshot = JSON.parse(await readFile(assignmentPath, "utf8"));
const missingItemIds = [];
snapshot.assignments = snapshot.assignments.map((assignment) => {
  const itemId = String(assignment.monday_item_id);
  const districtType = districtTypeByItemId.get(itemId);
  if (!districtTypeByItemId.has(itemId)) missingItemIds.push(assignment.monday_item_id);
  return { ...assignment, district_type: districtType || "" };
});

if (missingItemIds.length) {
  throw new Error(`Missing District Type for ${missingItemIds.length} assignments: ${missingItemIds.join(", ")}`);
}

await writeFile(assignmentPath, `${JSON.stringify(snapshot, null, 2)}\n`);

const counts = Object.groupBy(snapshot.assignments, (assignment) => assignment.district_type);
console.log(
  JSON.stringify(
    Object.fromEntries(Object.entries(counts).map(([districtType, assignments]) => [districtType, assignments.length])),
    null,
    2,
  ),
);
