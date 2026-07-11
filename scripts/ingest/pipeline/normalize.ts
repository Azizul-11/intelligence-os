export interface NormalizedHospitalRecord {
  facilityId: string;
  hospitalName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  county: string;
  phoneNumber: string;
  hospitalType: string;
  ownership: string;
  emergencyServices: boolean;
}

export function normalizeRecords(records: any[]): NormalizedHospitalRecord[] {
  return records.map((record) => ({
    facilityId: record["Facility ID"]?.trim(),

    hospitalName: record["Facility Name"]?.trim(),

    address: record["Address"]?.trim(),

    city: record["City/Town"]?.trim(),

    state: record["State"]?.trim(),

    zipCode: record["ZIP Code"]?.trim(),

    county: record["County/Parish"]?.trim(),

    phoneNumber: record["Telephone Number"]?.trim(),

    hospitalType: record["Hospital Type"]?.trim(),

    ownership: record["Hospital Ownership"]?.trim(),

    emergencyServices:
      record["Emergency Services"]?.trim().toLowerCase() === "yes",
  }));
}