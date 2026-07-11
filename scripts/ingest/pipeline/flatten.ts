import type { HospitalEntity } from "./resolve";

export interface FlattenedWarehouse {
  hospitals: HospitalEntity[];
  states: { code: string }[];
  counties: {
    state: string;
    county: string;
  }[];
}

export function flattenEntities(resolved: {
  hospitals: Map<string, HospitalEntity>;
  states: Set<string>;
  counties: Set<string>;
}): FlattenedWarehouse {
  return {
    hospitals: [...resolved.hospitals.values()],

    states: [...resolved.states].map((state) => ({
      code: state,
    })),

    counties: [...resolved.counties].map((value) => {
      const [state, county] = value.split(":");

      return {
        state,
        county,
      };
    }),
  };
}