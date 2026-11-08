// Builds src/lib/texas-county-data.ts from public/geo/texas-counties.geojson.
// Run: node scripts/generate-texas-mock-data.mjs
// Everything except county names, GEOIDs, centroids and the approximate populations
// of the larger counties is synthetic and seeded, so reruns produce identical output.
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const geo = JSON.parse(readFileSync(new URL("public/geo/texas-counties.geojson", root), "utf8"));

// Approximate 2020 census populations for larger counties; the rest are seeded.
const POPULATION = {
  Harris: 4731000,
  Dallas: 2613000,
  Tarrant: 2110000,
  Bexar: 2009000,
  Travis: 1291000,
  Collin: 1065000,
  Denton: 907000,
  Hidalgo: 871000,
  "El Paso": 865000,
  "Fort Bend": 822000,
  Montgomery: 620000,
  Williamson: 610000,
  Cameron: 421000,
  Brazoria: 373000,
  Bell: 370000,
  Galveston: 351000,
  Nueces: 353000,
  Lubbock: 310000,
  Webb: 267000,
  McLennan: 261000,
  Jefferson: 256000,
  Hays: 241000,
  Smith: 233000,
  Brazos: 233000,
  Ellis: 193000,
  Johnson: 180000,
  Midland: 170000,
  Ector: 166000,
  Guadalupe: 172000,
  Comal: 162000,
  Kaufman: 146000,
  Taylor: 143000,
  Wichita: 129000,
  Parker: 149000,
  Grayson: 136000,
  Gregg: 124000,
  Randall: 141000,
  Potter: 118000,
  "Tom Green": 120000,
  Rockwall: 107000,
  Bastrop: 98000,
  Hunt: 99000,
  Victoria: 92000,
  Angelina: 86000,
  Liberty: 91000,
  Coryell: 83000,
  Henderson: 82000,
  Orange: 84000,
  Bowie: 92000,
  Walker: 76000,
  Harrison: 68000,
  Starr: 65000,
  Nacogdoches: 64000,
  Maverick: 57000,
  Kerr: 52000,
  Anderson: 58000,
  Hood: 61000,
  Waller: 56000,
  Wise: 68000,
  Burnet: 49000,
  Lamar: 50000,
  Rusk: 52000,
  Cherokee: 50000,
  Navarro: 52000,
  Wood: 44000,
  Hopkins: 36000,
  Upshur: 40000,
  "Van Zandt": 59000,
  Kendall: 44000,
  Medina: 50000,
  Erath: 42000,
  Polk: 50000,
  Hale: 32000,
  "Val Verde": 47000,
  Loving: 64,
  King: 265,
  Kenedy: 350,
  Borden: 630,
  McMullen: 600,
  Terrell: 760,
  Kent: 750,
  Roberts: 830,
};

let seed = 20261107;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}
function centroid(geometry) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const outer = polys.map((p) => p[0]).sort((a, b) => ringArea(b) - ringArea(a))[0];
  let x = 0,
    y = 0,
    a = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const f = outer[j][0] * outer[i][1] - outer[i][0] * outer[j][1];
    x += (outer[j][0] + outer[i][0]) * f;
    y += (outer[j][1] + outer[i][1]) * f;
    a += f;
  }
  return [+(x / (3 * a)).toFixed(4), +(y / (3 * a)).toFixed(4)];
}

// Main squall line: Wichita Falls → DFW (through Richardson) → Tyler → Shreveport.
const TRACK = [
  [-99.6, 33.95],
  [-94.2, 32.25],
];
// Secondary cells: Hill Country / Austin, Houston coastal flooding, Lubbock hail.
const CELLS = [
  { at: [-97.8, 30.3], radius: 0.9, strength: 0.55 },
  { at: [-95.4, 29.8], radius: 1.1, strength: 0.4 },
  { at: [-101.85, 33.6], radius: 0.8, strength: 0.4 },
];
function impact([lng, lat]) {
  const [[x1, y1], [x2, y2]] = TRACK;
  const dx = x2 - x1,
    dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((lng - x1) * dx + (lat - y1) * dy) / (dx * dx + dy * dy)));
  const d = Math.hypot(lng - (x1 + t * dx), lat - (y1 + t * dy));
  const taper = 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.6));
  let v = Math.exp(-((d / 0.75) ** 2)) * taper;
  for (const c of CELLS)
    v = Math.max(
      v,
      c.strength * Math.exp(-((Math.hypot(lng - c.at[0], lat - c.at[1]) / c.radius) ** 2)),
    );
  return Math.min(1, v + 0.02 + rand() * 0.05);
}

const counties = geo.features
  .map((f) => {
    const name = f.properties.NAME.replace(/ County$/, "");
    const center = centroid(f.geometry);
    const population =
      POPULATION[name] || Math.round(Math.exp(Math.log(800) + rand() * Math.log(40000 / 800)));
    const enrolled = Math.max(5, Math.round(population * (0.03 + rand() * 0.012)));
    const severity = impact(center);
    const silent = Math.round(enrolled * severity * (0.025 + rand() * 0.01));
    const silentAtHome = Math.round(silent * (0.08 + rand() * 0.04));
    const liveAloneSilent = Math.round(silentAtHome * (0.2 + rand() * 0.2));
    const outages = Math.round(population * 0.38 * severity ** 1.5 * (0.6 + rand() * 0.4));
    return {
      geoid: f.properties.GEOID,
      name,
      center,
      population,
      enrolled,
      severity: +severity.toFixed(2),
      silent,
      silentAtHome,
      liveAloneSilent,
      outages,
    };
  })
  .sort((a, b) => a.geoid.localeCompare(b.geoid));

const dallas = counties.find((c) => c.name === "Dallas");
if (dallas.silentAtHome < 40) throw new Error("Dallas must cover the Richardson neighborhoods");

const rows = counties
  .map(
    (c) =>
      `  { geoid: "${c.geoid}", name: ${JSON.stringify(c.name)}, center: [${c.center.join(", ")}], population: ${c.population}, enrolled: ${c.enrolled}, severity: ${c.severity}, silent: ${c.silent}, silentAtHome: ${c.silentAtHome}, liveAloneSilent: ${c.liveAloneSilent}, outages: ${c.outages} },`,
  )
  .join("\n");

writeFileSync(
  new URL("src/lib/texas-county-data.ts", root),
  `// Mock statewide response data for all 254 Texas counties.
// Built by scripts/generate-texas-mock-data.mjs; rerun the script instead of hand-editing rows.
// Populations are approximate; every response figure is synthetic.

export interface CountyResponse {
  geoid: string;
  name: string;
  /** [lng, lat] label point inside the county */
  center: [number, number];
  population: number;
  /** Residents enrolled in Doorstep check-ins */
  enrolled: number;
  /** 0–1 storm severity at the county centroid */
  severity: number;
  /** Enrolled residents who have not replied to the check-in */
  silent: number;
  /** Silent residents who said they would shelter at home */
  silentAtHome: number;
  liveAloneSilent: number;
  /** Customers without power */
  outages: number;
}

// prettier-ignore
export const TEXAS_COUNTIES: CountyResponse[] = [
${rows}
];
`,
);
const sum = (k) => counties.reduce((n, c) => n + c[k], 0);
console.log(
  `${counties.length} counties · enrolled ${sum("enrolled")} · silent ${sum("silent")} · home ${sum("silentAtHome")} · alone ${sum("liveAloneSilent")}`,
);
console.log(
  [...counties]
    .sort((a, b) => b.silentAtHome - a.silentAtHome)
    .slice(0, 12)
    .map((c) => `${c.name}:${c.silentAtHome}`)
    .join(" "),
);
