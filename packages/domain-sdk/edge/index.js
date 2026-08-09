// src/relationship-registry/relationship-cardinality.ts
var RelationshipCardinality = /* @__PURE__ */ ((RelationshipCardinality2) => {
  RelationshipCardinality2["ONE_TO_ONE"] = "one_to_one";
  RelationshipCardinality2["ONE_TO_MANY"] = "one_to_many";
  RelationshipCardinality2["MANY_TO_ONE"] = "many_to_one";
  RelationshipCardinality2["MANY_TO_MANY"] = "many_to_many";
  return RelationshipCardinality2;
})(RelationshipCardinality || {});

// src/relationship-registry/relationship-type.ts
var RelationshipType = /* @__PURE__ */ ((RelationshipType2) => {
  RelationshipType2["ASSOCIATED_WITH"] = "associated_with";
  RelationshipType2["BELONGS_TO"] = "belongs_to";
  RelationshipType2["CONTAINS"] = "contains";
  RelationshipType2["DEPENDS_ON"] = "depends_on";
  RelationshipType2["DERIVED_FROM"] = "derived_from";
  RelationshipType2["MEASURES"] = "measures";
  RelationshipType2["REFERENCES"] = "references";
  RelationshipType2["RELATED_TO"] = "related_to";
  return RelationshipType2;
})(RelationshipType || {});
export {
  RelationshipCardinality,
  RelationshipType
};
