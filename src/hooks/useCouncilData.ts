"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection, Geometry } from "geojson";
import type { CouncilData } from "../types/gis";

const dataPath = (fileName: string) => `${import.meta.env.BASE_URL}data/${fileName}`;

const dataFiles = {
  council: dataPath("CapitolAreaCouncil.geojson"),
  counties: dataPath("CapitolAreaCouncil_Counties.geojson"),
  scouting: dataPath("CapitolAreaCouncil_ScoutingDistricts.geojson"),
  schoolDistricts: dataPath("CapitolAreaCouncil_SchoolDistricts.geojson"),
  schoolPoints: dataPath("CapitolAreaCouncil_Schools.geojson"),
  manifest: dataPath("data-manifest.json"),
} as const;

type RecruitmentSchool = {
  name?: string;
  schoolDistrict?: string;
  address?: string;
  status?: string;
  scoutingDistrict?: string;
  jsnDate?: string;
  youthTalkDate?: string;
  approval?: string;
  staff?: string;
  units?: string;
  county?: string;
  grades?: string;
  locationType?: string;
  administrator?: string;
  phone?: string;
  website?: string;
  ncesId?: string;
};

type RecruitmentPayload = {
  extractedAt?: string;
  schools?: RecruitmentSchool[];
};

const schoolKey = (name: unknown, district: unknown) =>
  `${String(name ?? "").trim().toUpperCase()}|${String(district ?? "").trim().toUpperCase()}`;

export function enrichSchoolPoints(collection: FeatureCollection<Geometry>, payload: RecruitmentPayload) {
  const details = new Map(
    (payload.schools ?? []).map((school) => [schoolKey(school.name, school.schoolDistrict), school]),
  );
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const properties = feature.properties ?? {};
      const school = details.get(schoolKey(properties.school_name, properties.school_district));
      if (!school) return feature;
      return {
        ...feature,
        properties: {
          ...properties,
          recruitment_status: school.status,
          address: school.address || properties.address,
          scouting_district: school.scoutingDistrict || properties.scouting_district,
          jsn_date: school.jsnDate,
          youth_talk_date: school.youthTalkDate,
          approval_status: school.approval,
          staff: school.staff,
          unit: school.units,
          county: school.county || properties.county,
          grades: school.grades,
          location_type: school.locationType,
          administrator: school.administrator,
          phone: school.phone,
          website: school.website,
          nces_id: school.ncesId,
        },
      };
    }),
  };
}

export function useCouncilData() {
  const [data, setData] = useState<CouncilData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all(
      [...Object.entries(dataFiles), ["recruitment", `${import.meta.env.BASE_URL}map-data.json`]].map(async ([key, url]) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load ${url}`);
        return [key, await response.json()] as const;
      }),
    )
      .then((entries) => {
        if (!active) return;
        const loaded = Object.fromEntries(entries) as CouncilData & { recruitment: RecruitmentPayload };
        const recruitment = loaded.recruitment;
        loaded.schoolPoints = enrichSchoolPoints(loaded.schoolPoints, recruitment);
        loaded.manifest = { ...loaded.manifest, recruitment_data_at: recruitment.extractedAt };
        delete (loaded as Partial<typeof loaded>).recruitment;
        setData(loaded);
      })
      .catch((reason: Error) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);

  return { data, error };
}
