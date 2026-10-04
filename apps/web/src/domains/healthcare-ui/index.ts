import type { ResultVisualizer } from "../types";
import { HospitalCompare } from "./HospitalCompare";
import { HospitalDossier } from "./HospitalDossier";
import { isHospitalProfile } from "./measures";

// Registered on the healthcare domain config; the generic canvas only ever asks "does a visualizer match these rows?".
export const healthcareVisualizers: readonly ResultVisualizer[] = [
  {
    id: "hospital-dossier",
    openLabel: "View full profile",
    matches: (rows) => rows.length === 1 && isHospitalProfile(rows),
    Component: HospitalDossier,
  },
  {
    id: "hospital-compare",
    openLabel: "Compare side by side",
    // The wide layout is built for 2-3 hospitals; more rows fall back to the generic table.
    matches: (rows) => (rows.length === 2 || rows.length === 3) && isHospitalProfile(rows),
    Component: HospitalCompare,
  },
];
