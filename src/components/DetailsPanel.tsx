import type { SelectedFeature } from "../types/gis";
import { formatRecruitmentDate, normalizeWebsite } from "../lib/display";

const genericPreferred = [
  "district_name", "label", "coverage", "pct_district_in_council", "scouting_districts",
  "council_counties", "district_number", "area_in_council_sq_km", "assignment_school_count",
  "school_district_count", "derivation",
];

const labels: Record<string, string> = {
  district_name: "District",
  label: "County",
  coverage: "Council coverage",
  pct_district_in_council: "District inside council",
  council_counties: "Council counties",
  district_number: "District number",
  area_in_council_sq_km: "Area in council",
  scouting_districts: "Current scouting districts",
  assignment_school_count: "Assigned schools",
  school_district_count: "School districts represented",
  derivation: "How this region was derived",
};

function field(properties: Record<string, unknown>, key: string) {
  const value = properties[key];
  return value === undefined || value === null || String(value).trim() === "" ? "—" : String(value);
}

function DetailItem({ label, value, wide = false }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === "—") return null;
  return <div className={wide ? "detail-item wide" : "detail-item"}><dt>{label}</dt><dd>{value}</dd></div>;
}

export function DetailsPanel({ feature, onClose }: { feature: SelectedFeature; onClose: () => void }) {
  if (!feature) return null;
  const properties = feature.properties ?? {};
  const isSchool = Boolean(properties.school_name);

  if (isSchool) {
    const status = field(properties, "recruitment_status");
    const website = normalizeWebsite(properties.website);
    const phone = field(properties, "phone");
    const eventDate = field(properties, "jsn_date");
    const youthTalkDate = field(properties, "youth_talk_date");
    return (
      <aside className="details-panel school-card" aria-live="polite" aria-label="Selected school Join Scout Night information">
        <div className="details-heading">
          <div><p className="section-kicker">Selected recruitment school</p><h2>{field(properties, "school_name")}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close school information">×</button>
        </div>

        <span className="status-pill">{status}</span>

        {eventDate !== "—" && (
          <div className="event-callout">
            <span>Join Scout Night</span>
            <strong>{formatRecruitmentDate(eventDate)}</strong>
            {field(properties, "location_type") !== "—" && <small>{field(properties, "location_type")}</small>}
          </div>
        )}

        <section className="card-section">
          <h3>Event coordination</h3>
          <dl className="details-grid">
            <DetailItem label="Assigned unit" value={field(properties, "unit")} />
            <DetailItem label="Staff lead" value={field(properties, "staff")} />
            <DetailItem label="Approval" value={field(properties, "approval_status")} />
            <DetailItem label="Youth talk" value={youthTalkDate === "—" ? "—" : formatRecruitmentDate(youthTalkDate)} />
          </dl>
        </section>

        <section className="card-section">
          <h3>School assignment</h3>
          <dl className="details-grid">
            <DetailItem label="Scouting district" value={field(properties, "scouting_district")} />
            <DetailItem label="School district" value={field(properties, "school_district")} />
            <DetailItem label="County" value={field(properties, "county")} />
            <DetailItem label="Grades" value={field(properties, "grades")} />
          </dl>
        </section>

        <section className="card-section">
          <h3>School contact</h3>
          <dl className="details-grid">
            <DetailItem label="Administrator" value={field(properties, "administrator")} wide />
            <DetailItem label="Phone" value={phone === "—" ? "—" : <a href={`tel:${phone}`}>{phone}</a>} />
            <DetailItem label="Website" value={website ? <a href={website} target="_blank" rel="noreferrer">Open website</a> : "—"} />
            <DetailItem label="Address" value={field(properties, "address")} wide />
          </dl>
        </section>
      </aside>
    );
  }

  const rows = genericPreferred.filter((key) => properties[key] !== undefined && properties[key] !== "");
  return (
    <aside className="details-panel" aria-live="polite">
      <div className="details-heading">
        <div><p className="section-kicker">Selected map feature</p><h2>{field(properties, "district_name") !== "—" ? field(properties, "district_name") : field(properties, "label")}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">×</button>
      </div>
      <dl className="generic-details">
        {rows.map((key) => (
          <div key={key}>
            <dt>{labels[key] ?? key}</dt>
            <dd>
              {key === "pct_district_in_council"
                ? `${Number(properties[key]).toFixed(1)}%`
                : key === "area_in_council_sq_km"
                  ? `${Number(properties[key]).toLocaleString()} km²`
                  : String(properties[key])}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
