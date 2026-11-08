# Texas county boundaries

`texas-counties.geojson` contains all 254 Texas counties from the U.S. Census
Bureau's TIGERweb State_County service (current 2026 vintage), downloaded on
November 7, 2026. Census geographic data is public domain.

Source: https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1

Query parameters: `where=STATE='48'`, `outFields=GEOID,NAME`,
`returnGeometry=true`, `outSR=4326`, `geometryPrecision=5`,
`maxAllowableOffset=0.0005`, `f=geojson`.

The service simplifies geometry to approximately 50 meters for display. Polygon
and multipolygon boundaries are retained; selection and camera bounds use those
geometries, including offshore parts. Each feature's stable ID is its county FIPS
code (`GEOID`). The asset is served locally, so county selection does not depend
on the Census service being online.

Buildings are not included here. They stream only for visible map tiles from the
existing keyless OpenFreeMap Positron basemap (OpenStreetMap/OpenMapTiles).
