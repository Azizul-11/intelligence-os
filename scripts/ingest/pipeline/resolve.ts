export interface HospitalEntity {
  facilityId: string;
  hospitalName: string;
  address: string;
  city: string;
  state: string;
  county: string;
  zipCode: string;
  phoneNumber: string;
  hospitalType: string;
  ownership: string;
  emergencyServices: boolean;
}

export function resolveEntities(records: HospitalEntity[]) {
  const hospitals = new Map<string, HospitalEntity>();
  const states = new Set<string>();
  const counties = new Set<string>();

  for (const record of records) {
    hospitals.set(record.facilityId, record);

    states.add(record.state);

    counties.add(`${record.state}:${record.county}`);
  }

  return {
    hospitals,
    states,
    counties,
  };
}