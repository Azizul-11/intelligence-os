/** Domain-agnostic platform classification of an entity; Domain SDKs provide more specific ones. */
export enum EntityKind {
  Unknown = "unknown",

  Organization = "organization",

  Person = "person",

  Place = "place",

  Facility = "facility",

  Asset = "asset",

  Product = "product",

  Dataset = "dataset",

  Document = "document",

  Event = "event",

  System = "system",
}