# Capitol Area Council District Atlas

A production-oriented interactive GIS map for the Capitol Area Council of Scouting America. It combines the council’s 15-county service footprint, current scouting regions derived from the CAC Schools monday.com table, school-district polygons, and an optional recruitment-school overlay.

The council began in 1912 and its mapped service area is restricted to Bastrop, Blanco, Burnet, Caldwell, DeWitt, Fayette, Gillespie, Gonzales, Hays, Lavaca, Lee, Llano, Mason, Travis, and Williamson counties.

## Included map tools

- MapLibre GL map fitted from the council boundary geometry
- County, scouting-district, school-district, and recruitment-school layers
- Searchable county, scouting-district, and school-district attribute tables
- Full/partial school-district coverage filters and a minimum-percent slider
- Click details and automatic zoom to selected features
- Filtered CSV and GeoJSON downloads
- Responsive layouts and a print-focused map view
- Navigation constrained to the 15-county service area

## Data summary

| Layer | Count | Source |
| --- | ---: | --- |
| Council counties | 15 | U.S. Census Bureau 2025 Cartographic Boundary File |
| School districts | 91 | Texas Education Agency / Texas Legislative Council, SY 2025–26 |
| Full / partial districts | 43 / 48 | Supplied council coverage analysis |
| Current scouting regions | 10 derived regions | CAC Schools monday.com table |
| Recruitment schools | 480 Independent-type points | Existing council recruitment workbook export |

The school-district source CSV contains unreliable centroid fields for several rows. This application does not use those values: displayed bounds and labels are calculated from the reprojected and clipped polygon geometry. Recruitment-school points outside the council boundary are excluded.

### Scouting-region methodology

The older council district map is not used. The atlas joins school districts to current CAC Schools assignments whose District Type is Independent, excludes Waterloo and Exploring, and builds each scouting region from the eligible assigned school-district polygons. A school district is subdivided using mapped eligible school assignments only when its current schools span multiple scouting districts. These regions are a current planning aid, not legal boundaries.

## Development

Requires Node.js 22.13 or newer.

```bash
pnpm install
pnpm dev
pnpm test
pnpm build
```

The generated GeoJSON files are committed under `public/data` so the site can build without downloading external GIS files.

## Rebuilding the GIS files

Run `pnpm data:build` after placing the source files at the default paths listed in `scripts/build-gis-data.mjs`, or provide these environment variables:

- `SCHOOL_DISTRICT_SHP`
- `SCHOOL_DISTRICT_CSV`
- `COUNTY_SHP`

The build script:

1. filters the national county file to the 15 council counties;
2. dissolves those counties into the council boundary;
3. reprojects Texas school-district geometry to WGS84;
4. clips the 91 selected school districts to the council boundary;
5. filters the CAC Schools assignment snapshot to District Type = Independent and derives current scouting regions; and
6. writes a validation manifest with counts and council bounds.

## Source links

- CAC Schools monday.com table (authenticated council source)
- [Texas school-district boundaries](https://data.capitol.texas.gov/dataset/school-districts)
- [U.S. Census cartographic boundary files](https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html)
