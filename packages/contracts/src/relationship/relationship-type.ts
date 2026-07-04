/**
 * Describes the semantic type of a relationship.
 */
export enum RelationshipType {
  BelongsTo = "belongs_to",
  LocatedIn = "located_in",
  ManagedBy = "managed_by",
  WorksAt = "works_at",
  MemberOf = "member_of",
  ParentOf = "parent_of",
  ChildOf = "child_of",
  RelatedTo = "related_to",
}