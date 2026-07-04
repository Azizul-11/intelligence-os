/**
 * High-level platform classification for any entity within IntelligenceOS.
 *
 * EntityKind is intentionally domain-agnostic.
 * Domain SDKs (Healthcare, Education, Finance, etc.)
 * provide more specific classifications.
 */
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