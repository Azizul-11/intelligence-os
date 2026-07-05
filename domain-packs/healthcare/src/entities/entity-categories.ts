import type { EntityCategory } from "@intelligence/domain-sdk";

export const organizationCategory: EntityCategory = {
  id: "organization",
  name: "Organization",
  description: "Organizations operating within the healthcare domain.",
};

export const personCategory: EntityCategory = {
  id: "person",
  name: "Person",
  description: "People participating in healthcare delivery.",
};

export const locationCategory: EntityCategory = {
  id: "location",
  name: "Location",
  description: "Geographic locations used in healthcare analytics.",
};