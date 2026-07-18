import { AliasResolver } from "./alias";
import { Matcher } from "./matcher";
import { Normalizer } from "./normalizer";
import { Ontology } from "./ontology";
import { SemanticRegistryBuilder } from "./registry";
import { SemanticResolver } from "./resolver";

export function createSemanticResolver(): SemanticResolver {
  const builder = new SemanticRegistryBuilder();

  const registry = builder.build();

  return new SemanticResolver(
    new Normalizer(),
    new AliasResolver(registry.getAliases()),
    new Matcher(),
    new Ontology(registry),
  );
}