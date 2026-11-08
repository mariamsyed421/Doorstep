import { TEXAS_COUNTIES, type CountyResponse } from "./texas-county-data";

export type PlanAnswer = "home" | "family" | "shelter" | null;
export type CheckIn = "safe" | "needsHelp" | "silent";

export interface Resident {
  id: string;
  name: string;
  shortName: string;
  address: string;
  age: number;
  language: "English" | "Spanish" | "Vietnamese" | "Arabic";
  livesAlone: boolean;
  medicalNeed: string | null;
  planAnswer: PlanAnswer;
  planDetail: string | null;
  checkInStatus: CheckIn;
  silentHours: number;
  emergencyContact: { name: string; relation: string };
  neighbor: { name: string; address: string; lat: number; lng: number };
  row: "north" | "south";
  lat: number;
  lng: number;
  planQuote: string;
}

type ResidentInput = Omit<Resident, "id" | "lat" | "lng" | "planQuote" | "neighbor"> & {
  neighbor: { name: string; address: string };
  planQuote?: string;
};
const location = (address: string): { lat: number; lng: number } => {
  const n = Number(address.split(" ")[0]);
  return { lat: 32.9539 + (n % 2 === 0 ? 0.00065 : -0.00065), lng: -96.739 + (n - 400) * 0.00013 };
};
const r = (x: ResidentInput): Resident => ({
  ...x,
  id: x.address.split(" ")[0] ?? x.address,
  ...location(x.address),
  neighbor: { ...x.neighbor, ...location(x.neighbor.address) },
  planQuote:
    x.planQuote ??
    (x.name.startsWith("Elena")
      ? "Staying home, my daughter can't come get me."
      : x.planAnswer === "home"
        ? "I'll be staying home through the storm."
        : (x.planDetail ?? "No reply to the plan question")),
});

export const RESIDENTS: Resident[] = [
  // North side (even)
  r({
    name: "Grace Whitfield",
    shortName: "Ms. Whitfield",
    address: "400 Elm St",
    age: 64,
    language: "English",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Tom", relation: "husband" },
    neighbor: { name: "Ken Park", address: "402 Elm St" },
    row: "north",
  }),
  r({
    name: "Ken Park",
    shortName: "Mr. Park",
    address: "402 Elm St",
    age: 41,
    language: "English",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Jin", relation: "wife" },
    neighbor: { name: "Grace Whitfield", address: "400 Elm St" },
    row: "north",
  }),
  r({
    name: "Rosa Delgado",
    shortName: "Ms. Delgado",
    address: "404 Elm St",
    age: 52,
    language: "Spanish",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "shelter",
    planDetail: "At Richardson shelter",
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Luis", relation: "brother" },
    neighbor: { name: "Ken Park", address: "402 Elm St" },
    row: "north",
  }),
  r({
    name: "Omar Haddad",
    shortName: "Mr. Haddad",
    address: "406 Elm St",
    age: 71,
    language: "Arabic",
    livesAlone: false,
    medicalNeed: "Home oxygen",
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "needsHelp",
    silentHours: 0,
    emergencyContact: { name: "Layla", relation: "daughter" },
    neighbor: { name: "Maria Gonzalez", address: "414 Elm St" },
    row: "north",
  }),
  r({
    name: "Linh Nguyen",
    shortName: "Ms. Nguyen",
    address: "408 Elm St",
    age: 35,
    language: "Vietnamese",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Bao", relation: "husband" },
    neighbor: { name: "Omar Haddad", address: "406 Elm St" },
    row: "north",
  }),
  r({
    name: "Harold Brooks",
    shortName: "Mr. Brooks",
    address: "410 Elm St",
    age: 69,
    language: "English",
    livesAlone: true,
    medicalNeed: null,
    planAnswer: "family",
    planDetail: "At daughter's in Allen",
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Anne", relation: "daughter" },
    neighbor: { name: "Maria Gonzalez", address: "414 Elm St" },
    row: "north",
  }),
  r({
    name: "Elena Lopez",
    shortName: "Mrs. Lopez",
    address: "412 Elm St",
    age: 78,
    language: "Spanish",
    livesAlone: true,
    medicalNeed: "Uses a walker",
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "silent",
    silentHours: 3,
    emergencyContact: { name: "Carmen", relation: "niece" },
    neighbor: { name: "Maria Gonzalez", address: "414 Elm St" },
    row: "north",
  }),
  r({
    name: "Maria Gonzalez",
    shortName: "Ms. Gonzalez",
    address: "414 Elm St",
    age: 46,
    language: "Spanish",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Jorge", relation: "husband" },
    neighbor: { name: "Elena Lopez", address: "412 Elm St" },
    row: "north",
  }),
  r({
    name: "Samir Aziz",
    shortName: "Mr. Aziz",
    address: "416 Elm St",
    age: 29,
    language: "Arabic",
    livesAlone: true,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Nadia", relation: "sister" },
    neighbor: { name: "Maria Gonzalez", address: "414 Elm St" },
    row: "north",
  }),
  r({
    name: "Betty Olsen",
    shortName: "Mrs. Olsen",
    address: "418 Elm St",
    age: 83,
    language: "English",
    livesAlone: true,
    medicalNeed: "Insulin, needs fridge",
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Eric", relation: "grandson" },
    neighbor: { name: "Samir Aziz", address: "416 Elm St" },
    row: "north",
  }),
  // South side (odd)
  r({
    name: "James Carter",
    shortName: "Mr. Carter",
    address: "419 Elm St",
    age: 58,
    language: "English",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Dana", relation: "wife" },
    neighbor: { name: "Ana Ruiz", address: "421 Elm St" },
    row: "south",
  }),
  r({
    name: "Ana Ruiz",
    shortName: "Ms. Ruiz",
    address: "421 Elm St",
    age: 33,
    language: "Spanish",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Pablo", relation: "partner" },
    neighbor: { name: "James Carter", address: "419 Elm St" },
    row: "south",
  }),
  r({
    name: "Thu Pham",
    shortName: "Mrs. Pham",
    address: "423 Elm St",
    age: 67,
    language: "Vietnamese",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "shelter",
    planDetail: "At Richardson shelter",
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Minh", relation: "son" },
    neighbor: { name: "Ana Ruiz", address: "421 Elm St" },
    row: "south",
  }),
  r({
    name: "Fatima Saleh",
    shortName: "Mrs. Saleh",
    address: "425 Elm St",
    age: 54,
    language: "Arabic",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Karim", relation: "husband" },
    neighbor: { name: "Hung Tran", address: "427 Elm St" },
    row: "south",
  }),
  r({
    name: "Hung Tran",
    shortName: "Mr. Tran",
    address: "427 Elm St",
    age: 81,
    language: "Vietnamese",
    livesAlone: true,
    medicalNeed: "Heart medication",
    planAnswer: "family",
    planDetail: "At son's in Plano",
    checkInStatus: "silent",
    silentHours: 3,
    emergencyContact: { name: "Daniel", relation: "son" },
    neighbor: { name: "Fatima Saleh", address: "425 Elm St" },
    row: "south",
  }),
  r({
    name: "Mike Russo",
    shortName: "Mr. Russo",
    address: "429 Elm St",
    age: 44,
    language: "English",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Gina", relation: "wife" },
    neighbor: { name: "Hung Tran", address: "427 Elm St" },
    row: "south",
  }),
  r({
    name: "Carlos Mendez",
    shortName: "Mr. Mendez",
    address: "431 Elm St",
    age: 38,
    language: "Spanish",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Sofia", relation: "wife" },
    neighbor: { name: "Mike Russo", address: "429 Elm St" },
    row: "south",
  }),
  r({
    name: "Frank Walsh",
    shortName: "Mr. Walsh",
    address: "433 Elm St",
    age: 74,
    language: "English",
    livesAlone: true,
    medicalNeed: "Limited mobility",
    planAnswer: null,
    planDetail: null,
    checkInStatus: "silent",
    silentHours: 3,
    emergencyContact: { name: "Unknown", relation: "none on file" },
    neighbor: { name: "Carlos Mendez", address: "431 Elm St" },
    row: "south",
  }),
  r({
    name: "Priya Shah",
    shortName: "Ms. Shah",
    address: "435 Elm St",
    age: 31,
    language: "English",
    livesAlone: true,
    medicalNeed: null,
    planAnswer: null,
    planDetail: null,
    checkInStatus: "silent",
    silentHours: 2,
    emergencyContact: { name: "Raj", relation: "brother" },
    neighbor: { name: "Frank Walsh", address: "433 Elm St" },
    row: "south",
  }),
  r({
    name: "Duc Le",
    shortName: "Mr. Le",
    address: "437 Elm St",
    age: 60,
    language: "Vietnamese",
    livesAlone: false,
    medicalNeed: null,
    planAnswer: "home",
    planDetail: null,
    checkInStatus: "safe",
    silentHours: 0,
    emergencyContact: { name: "Mai", relation: "wife" },
    neighbor: { name: "Priya Shah", address: "435 Elm St" },
    row: "south",
  }),
  ...[
    "Alice Bennett",
    "George Wilson",
    "Nadia Hassan",
    "Minh Vu",
    "Lucia Torres",
    "Robert Ellis",
    "Evelyn Reed",
    "Hassan Ali",
    "David Kim",
    "Sofia Reyes",
  ].map((name, i) =>
    r({
      name,
      shortName: name.split(" ")[0] ?? name,
      address: `${438 + i * 2} Elm St`,
      age: 66 + i * 2,
      language: (["English", "Spanish", "Vietnamese", "Arabic"] as const)[i % 4] ?? "English",
      livesAlone: i < 8,
      medicalNeed: i % 3 === 0 ? "Limited mobility" : null,
      planAnswer: "home",
      planDetail: null,
      checkInStatus: i === 0 || i === 7 ? "silent" : "safe",
      silentHours: i === 0 || i === 7 ? 3 : 0,
      emergencyContact: { name: "Alex", relation: "child" },
      neighbor: { name: "Maria Gonzalez", address: "414 Elm St" },
      row: "north",
    }),
  ),
];

export const STAGES = ["Before storm", "Storm hits", "2 hours after", "6 hours after"] as const;

export type Group = "check" | "call" | "unknown";
export function groupFor(r: Resident): Group {
  if (r.planAnswer === "home") return "check";
  if (r.planAnswer === null) return "unknown";
  return "call";
}

export function planLabel(r: Resident) {
  if (r.planAnswer === "home") return "Staying home";
  if (r.planAnswer === null) return "Never answered";
  return r.planDetail ?? (r.planAnswer === "shelter" ? "At a shelter" : "With family");
}

export function replyText(r: Resident) {
  if (r.planAnswer === "home") return "1 Home";
  if (r.planAnswer === "family") return `2 — ${r.planDetail}`;
  if (r.planAnswer === "shelter") return `3 — ${r.planDetail}`;
  return null;
}

export type ResponseStatus = CheckIn | "helpOnWay";
export type Resolutions = Record<string, ResponseStatus>;
export interface District {
  id: string;
  name: string;
  totalResidents: number;
  silentAtHome: number;
  liveAloneSilent: number;
  polygon: [number, number][];
}
const district = (
  id: string,
  name: string,
  lat: number,
  lng: number,
  totalResidents: number,
  silentAtHome: number,
  liveAloneSilent: number,
): District => ({
  id,
  name,
  totalResidents,
  silentAtHome,
  liveAloneSilent,
  polygon: [
    [lat, lng],
    [lat + 0.012, lng + 0.002],
    [lat + 0.011, lng + 0.018],
    [lat - 0.002, lng + 0.019],
    [lat - 0.003, lng + 0.006],
  ],
});
export const DISTRICTS: District[] = [
  district("elm", "Elm District", 32.949, -96.745, 1480, 3, 3),
  district("canyon", "Canyon Creek", 32.976, -96.738, 1620, 8, 2),
  district("heights", "Richardson Heights", 32.953, -96.777, 1380, 7, 1),
  district("cumberland", "Cumberland", 32.933, -96.766, 1260, 5, 1),
  district("duck", "Duck Creek", 32.948, -96.718, 1420, 4, 1),
  district("spring", "Spring Valley", 32.927, -96.794, 1340, 3, 0),
  district("prairie", "Prairie Creek", 32.978, -96.77, 1180, 3, 0),
  district("northrich", "Northrich", 32.976, -96.799, 1220, 2, 0),
  district("college", "College Park", 32.927, -96.728, 1100, 0, 0),
];
export function urgency(count: number): "quiet" | "amber" | "orange" | "red" {
  return count === 0 ? "quiet" : count <= 3 ? "amber" : count <= 8 ? "orange" : "red";
}
export function districtCount(d: District, resolved: Resolutions) {
  return d.id === "elm"
    ? RESIDENTS.filter(
        (r) => r.planAnswer === "home" && (resolved[r.id] ?? r.checkInStatus) === "silent",
      ).length
    : d.silentAtHome;
}
export { TEXAS_COUNTIES, type CountyResponse } from "./texas-county-data";

/** Dallas County contains Richardson, so it hosts the neighborhood and Elm Street demos. */
export const DEMO_COUNTY = "48113";
export const COUNTY_BY_GEOID = new Map(TEXAS_COUNTIES.map((c) => [c.geoid, c]));
export const TEXAS_TOTALS = TEXAS_COUNTIES.reduce(
  (t, c) => ({
    population: t.population + c.population,
    enrolled: t.enrolled + c.enrolled,
    silent: t.silent + c.silent,
    silentAtHome: t.silentAtHome + c.silentAtHome,
    liveAloneSilent: t.liveAloneSilent + c.liveAloneSilent,
    outages: t.outages + c.outages,
  }),
  { population: 0, enrolled: 0, silent: 0, silentAtHome: 0, liveAloneSilent: 0, outages: 0 },
);
/** Counties ranked by residents silent at home, highest first. */
export const COUNTIES_BY_PRIORITY = [...TEXAS_COUNTIES].sort(
  (a, b) => b.silentAtHome - a.silentAtHome || b.silent - a.silent,
);
function resolvedSilent(resolved: Resolutions) {
  return RESIDENTS.filter(
    (r) =>
      r.checkInStatus === "silent" &&
      resolved[r.id] &&
      resolved[r.id] !== "silent" &&
      resolved[r.id] !== "helpOnWay",
  ).length;
}
export function unconfirmed(resolved: Resolutions) {
  return TEXAS_TOTALS.silentAtHome - resolvedSilent(resolved);
}
export function accountedFor(resolved: Resolutions) {
  return TEXAS_TOTALS.enrolled - unconfirmed(resolved);
}
export function countySilentAtHome(c: CountyResponse, resolved: Resolutions) {
  return c.geoid === DEMO_COUNTY ? c.silentAtHome - resolvedSilent(resolved) : c.silentAtHome;
}
export function markerState(r: Resident, resolved: Resolutions) {
  const status = resolved[r.id] ?? r.checkInStatus;
  if (status === "needsHelp" || status === "helpOnWay") return "help";
  if (r.planAnswer === null) return status === "safe" ? "safe" : "unknown";
  if (r.planAnswer !== "home") return "away";
  return status === "safe" ? "safe" : "danger";
}

/** Urgency score: lives alone, age, language barrier, and hours silent. */
export function urgencyScore(r: Resident) {
  return (
    (r.livesAlone ? 3 : 0) +
    (r.age >= 70 ? 3 : 0) +
    (r.language !== "English" ? 2 : 0) +
    Math.min(r.silentHours, 4)
  );
}
