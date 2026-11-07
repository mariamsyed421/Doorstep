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
  neighbor: { name: string; address: string };
  row: "north" | "south";
}

const r = (x: Omit<Resident, "id">): Resident => ({ ...x, id: x.address.split(" ")[0] ?? x.address });

export const RESIDENTS: Resident[] = [
  // North side (even)
  r({ name: "Grace Whitfield", shortName: "Ms. Whitfield", address: "400 Elm St", age: 64, language: "English", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Tom", relation: "husband" }, neighbor: { name: "Ken Park", address: "402 Elm St" }, row: "north" }),
  r({ name: "Ken Park", shortName: "Mr. Park", address: "402 Elm St", age: 41, language: "English", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Jin", relation: "wife" }, neighbor: { name: "Grace Whitfield", address: "400 Elm St" }, row: "north" }),
  r({ name: "Rosa Delgado", shortName: "Ms. Delgado", address: "404 Elm St", age: 52, language: "Spanish", livesAlone: false, medicalNeed: null, planAnswer: "shelter", planDetail: "At Richardson shelter", checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Luis", relation: "brother" }, neighbor: { name: "Ken Park", address: "402 Elm St" }, row: "north" }),
  r({ name: "Omar Haddad", shortName: "Mr. Haddad", address: "406 Elm St", age: 71, language: "Arabic", livesAlone: false, medicalNeed: "Home oxygen", planAnswer: "home", planDetail: null, checkInStatus: "needsHelp", silentHours: 0, emergencyContact: { name: "Layla", relation: "daughter" }, neighbor: { name: "Maria Gonzalez", address: "414 Elm St" }, row: "north" }),
  r({ name: "Linh Nguyen", shortName: "Ms. Nguyen", address: "408 Elm St", age: 35, language: "Vietnamese", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Bao", relation: "husband" }, neighbor: { name: "Omar Haddad", address: "406 Elm St" }, row: "north" }),
  r({ name: "Harold Brooks", shortName: "Mr. Brooks", address: "410 Elm St", age: 69, language: "English", livesAlone: true, medicalNeed: null, planAnswer: "family", planDetail: "At daughter's in Allen", checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Anne", relation: "daughter" }, neighbor: { name: "Maria Gonzalez", address: "414 Elm St" }, row: "north" }),
  r({ name: "Elena Lopez", shortName: "Mrs. Lopez", address: "412 Elm St", age: 78, language: "Spanish", livesAlone: true, medicalNeed: "Uses a walker", planAnswer: "home", planDetail: null, checkInStatus: "silent", silentHours: 3, emergencyContact: { name: "Carmen", relation: "niece" }, neighbor: { name: "Maria Gonzalez", address: "414 Elm St" }, row: "north" }),
  r({ name: "Maria Gonzalez", shortName: "Ms. Gonzalez", address: "414 Elm St", age: 46, language: "Spanish", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Jorge", relation: "husband" }, neighbor: { name: "Elena Lopez", address: "412 Elm St" }, row: "north" }),
  r({ name: "Samir Aziz", shortName: "Mr. Aziz", address: "416 Elm St", age: 29, language: "Arabic", livesAlone: true, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Nadia", relation: "sister" }, neighbor: { name: "Maria Gonzalez", address: "414 Elm St" }, row: "north" }),
  r({ name: "Betty Olsen", shortName: "Mrs. Olsen", address: "418 Elm St", age: 83, language: "English", livesAlone: true, medicalNeed: "Insulin, needs fridge", planAnswer: "family", planDetail: "At grandson's in Frisco", checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Eric", relation: "grandson" }, neighbor: { name: "Samir Aziz", address: "416 Elm St" }, row: "north" }),
  // South side (odd)
  r({ name: "James Carter", shortName: "Mr. Carter", address: "419 Elm St", age: 58, language: "English", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Dana", relation: "wife" }, neighbor: { name: "Ana Ruiz", address: "421 Elm St" }, row: "south" }),
  r({ name: "Ana Ruiz", shortName: "Ms. Ruiz", address: "421 Elm St", age: 33, language: "Spanish", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Pablo", relation: "partner" }, neighbor: { name: "James Carter", address: "419 Elm St" }, row: "south" }),
  r({ name: "Thu Pham", shortName: "Mrs. Pham", address: "423 Elm St", age: 67, language: "Vietnamese", livesAlone: false, medicalNeed: null, planAnswer: "shelter", planDetail: "At Richardson shelter", checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Minh", relation: "son" }, neighbor: { name: "Ana Ruiz", address: "421 Elm St" }, row: "south" }),
  r({ name: "Fatima Saleh", shortName: "Mrs. Saleh", address: "425 Elm St", age: 54, language: "Arabic", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Karim", relation: "husband" }, neighbor: { name: "Hung Tran", address: "427 Elm St" }, row: "south" }),
  r({ name: "Hung Tran", shortName: "Mr. Tran", address: "427 Elm St", age: 81, language: "Vietnamese", livesAlone: true, medicalNeed: "Heart medication", planAnswer: "family", planDetail: "At son's in Plano", checkInStatus: "silent", silentHours: 3, emergencyContact: { name: "Daniel", relation: "son" }, neighbor: { name: "Fatima Saleh", address: "425 Elm St" }, row: "south" }),
  r({ name: "Mike Russo", shortName: "Mr. Russo", address: "429 Elm St", age: 44, language: "English", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Gina", relation: "wife" }, neighbor: { name: "Hung Tran", address: "427 Elm St" }, row: "south" }),
  r({ name: "Carlos Mendez", shortName: "Mr. Mendez", address: "431 Elm St", age: 38, language: "Spanish", livesAlone: false, medicalNeed: null, planAnswer: "family", planDetail: "At cousin's in Garland", checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Sofia", relation: "wife" }, neighbor: { name: "Mike Russo", address: "429 Elm St" }, row: "south" }),
  r({ name: "Frank Walsh", shortName: "Mr. Walsh", address: "433 Elm St", age: 74, language: "English", livesAlone: true, medicalNeed: "Limited mobility", planAnswer: null, planDetail: null, checkInStatus: "silent", silentHours: 3, emergencyContact: { name: "Unknown", relation: "none on file" }, neighbor: { name: "Carlos Mendez", address: "431 Elm St" }, row: "south" }),
  r({ name: "Priya Shah", shortName: "Ms. Shah", address: "435 Elm St", age: 31, language: "English", livesAlone: true, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Raj", relation: "brother" }, neighbor: { name: "Frank Walsh", address: "433 Elm St" }, row: "south" }),
  r({ name: "Duc Le", shortName: "Mr. Le", address: "437 Elm St", age: 60, language: "Vietnamese", livesAlone: false, medicalNeed: null, planAnswer: "home", planDetail: null, checkInStatus: "safe", silentHours: 0, emergencyContact: { name: "Mai", relation: "wife" }, neighbor: { name: "Priya Shah", address: "435 Elm St" }, row: "south" }),
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
