import type { Resident } from "@/lib/doorstep-data";

/**
 * Recovery guidance shown only AFTER immediate safety needs are addressed. Insurance status is
 * voluntary, never assumed to be any particular carrier, and never affects priority scoring.
 * Doorstep has no access to any insurer's policy, claims, or catastrophe systems.
 */
export const RECOVERY_GUIDANCE = {
  documentation: [
    "Only document damage when it is safe — stay away from downed lines and standing water.",
    "Take wide photos of each room, then close-ups of damage; include a timestamp if possible.",
    "Keep receipts for emergency repairs, lodging, and supplies.",
    "Make temporary repairs to prevent further damage (e.g., tarp the roof) only if safe.",
  ],
  claimChecklist: [
    "Policy number and your insurer's claims contact",
    "List of damaged items with approximate value and age",
    "Photos/videos before throwing anything away",
    "Notes of every conversation: date, name, what was said",
  ],
  relief: [
    "FEMA Individual Assistance (DisasterAssistance.gov) if a declaration covers the area",
    "Local community relief and temporary housing resources via 211 Texas",
  ],
};

export function recoveryEligible(safetyResolved: boolean) {
  return safetyResolved;
}

export function insuranceNote(r: Resident) {
  return r.profile.insurance
    ? `Voluntarily shared: ${r.profile.insurance.carrier}. Used only to offer documentation guidance.`
    : "No insurance information shared. General recovery resources apply.";
}
