import type { Feature, FeatureCollection, Geometry } from "geojson";

export type LayerKey = "counties" | "scouting" | "schools";

export type CouncilData = {
  council: FeatureCollection<Geometry>;
  counties: FeatureCollection<Geometry>;
  scouting: FeatureCollection<Geometry>;
  schoolDistricts: FeatureCollection<Geometry>;
  schoolPoints: FeatureCollection<Geometry>;
  manifest: DataManifest;
};

export type DataManifest = {
  generated_at: string;
  recruitment_data_at?: string;
  service_area_since: number;
  council_bounds: [number, number, number, number];
  counts: {
    counties: number;
    school_districts: number;
    full_school_districts: number;
    partial_school_districts: number;
    scouting_district_names: number;
    scouting_regions: number;
    schools: number;
    assigned_schools: number;
    unassigned_schools: number;
  };
  notes: string[];
};

export type SelectedFeature = Feature<Geometry> | null;

export type VisibilityState = {
  counties: boolean;
  scouting: boolean;
  schoolDistricts: boolean;
  schoolPoints: boolean;
};
