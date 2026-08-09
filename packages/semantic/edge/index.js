// src/alias/alias-resolver.ts
var AliasResolver = class {
  constructor(aliases) {
    this.aliases = aliases;
  }
  aliases;
  resolve(input) {
    console.log("================================");
    console.log("ALIAS INPUT:", input);
    console.log("================================");
    const canonicalKey = this.aliases.get(input);
    console.log("MATCH:", canonicalKey);
    console.log("AliasResolver");
    console.log("Input:", input);
    console.log("Canonical:", canonicalKey);
    if (!canonicalKey) {
      return {
        matched: false,
        canonicalKey: null,
        alias: null
      };
    }
    return {
      matched: true,
      canonicalKey,
      alias: input
    };
  }
};

// src/matcher/matcher.ts
var Matcher = class {
  match(candidates) {
    const canonicalKey = candidates.at(0);
    if (!canonicalKey) {
      return {
        matched: false,
        canonicalKey: null
      };
    }
    return {
      matched: true,
      canonicalKey
    };
  }
};

// src/normalizer/normalizer.ts
var Normalizer = class {
  normalize(text) {
    return text.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  }
};

// src/ontology/ontology.ts
var Ontology = class {
  constructor(registry) {
    this.registry = registry;
  }
  registry;
  resolve(canonicalKey) {
    if (!canonicalKey) {
      return {
        found: false,
        canonicalKey: null,
        semanticType: null
      };
    }
    const semanticType = this.registry.getSemanticType(canonicalKey);
    if (!semanticType) {
      return {
        found: false,
        canonicalKey: null,
        semanticType: null
      };
    }
    let definition;
    switch (semanticType) {
      case "metric":
        definition = this.registry.getMetric(canonicalKey);
        break;
      case "entity":
        definition = this.registry.getEntity(canonicalKey);
        break;
      case "concept":
        definition = this.registry.getConcept(canonicalKey);
        break;
      case "category":
        definition = this.registry.getCategory(canonicalKey);
        break;
      case "dimension":
        definition = this.registry.getDimension(canonicalKey);
        break;
      case "relationship":
        definition = this.registry.getRelationship(canonicalKey);
        break;
      case "benchmark":
        definition = this.registry.getBenchmark(canonicalKey);
        break;
    }
    if (!definition) {
      return {
        found: false,
        canonicalKey: null,
        semanticType: null
      };
    }
    return {
      found: true,
      canonicalKey,
      semanticType,
      definition
    };
  }
};

// src/resolver/semantic-resolver.ts
var SemanticResolver = class {
  constructor(pipeline) {
    this.pipeline = pipeline;
  }
  pipeline;
  resolve(query) {
    return this.pipeline.resolve(query);
  }
};

// src/validation/duplicate-validator.ts
var DuplicateValidator = class {
  validate(context) {
    const errors = [];
    this.checkDuplicates(
      context.entities.map((e) => e.id),
      "Entity",
      errors
    );
    this.checkDuplicates(
      context.concepts.map((c) => c.id),
      "Concept",
      errors
    );
    this.checkDuplicates(
      context.metrics.map((m) => m.id),
      "Metric",
      errors
    );
    this.checkDuplicates(
      context.categories.map((c) => c.id),
      "Category",
      errors
    );
    this.checkDuplicates(
      context.dimensions.map((d) => d.id),
      "Dimension",
      errors
    );
    this.checkDuplicates(
      context.aliases.flatMap((a) => a.aliases),
      "Alias",
      errors
    );
    this.checkDuplicates(
      context.benchmarks.map((b) => b.id),
      "Benchmark",
      errors
    );
    this.checkDuplicates(
      context.capabilities.map((c) => c.id),
      "Capability",
      errors
    );
    this.checkDuplicates(
      context.recommendations.map((r) => r.id),
      "Recommendation",
      errors
    );
    this.checkDuplicates(
      context.sqlTemplates.map((t) => t.id),
      "SQL Template",
      errors
    );
    return {
      valid: errors.length === 0,
      warnings: [],
      errors
    };
  }
  checkDuplicates(values, label, errors) {
    const seen = /* @__PURE__ */ new Set();
    for (const value of values) {
      if (seen.has(value)) {
        errors.push(`${label} '${value}' is duplicated.`);
      }
      seen.add(value);
    }
  }
};

// src/validation/reference-validator.ts
var ReferenceValidator = class {
  validate(context) {
    const errors = [];
    const entityKeys = new Set(
      context.entities.map((e) => e.id)
    );
    const metricKeys = new Set(
      context.metrics.map((m) => m.id)
    );
    const benchmarkKeys = new Set(
      context.benchmarks.map((b) => b.id)
    );
    const conceptKeys = new Set(
      context.concepts.map((c) => c.id)
    );
    for (const alias of context.aliases) {
      switch (alias.type.toUpperCase()) {
        case "ENTITY":
          if (!entityKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown entity '${alias.canonical}'.`
            );
          }
          break;
        case "METRIC":
          if (!metricKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown metric '${alias.canonical}'.`
            );
          }
          break;
        case "BENCHMARK":
          if (!benchmarkKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown benchmark '${alias.canonical}'.`
            );
          }
          break;
        case "CONCEPT":
          if (!conceptKeys.has(alias.canonical)) {
            errors.push(
              `Alias '${alias.aliases.join(", ")}' references unknown concept '${alias.canonical}'.`
            );
          }
          break;
      }
    }
    return {
      valid: errors.length === 0,
      warnings: [],
      errors
    };
  }
};

// src/validation/relationship-validator.ts
var RelationshipValidator = class {
  validate(context) {
    const errors = [];
    const entityKeys = new Set(
      context.entities.map((entity) => entity.id)
    );
    for (const relationship of context.relationships) {
      if (!entityKeys.has(relationship.sourceEntity)) {
        errors.push(
          `Relationship references unknown source entity '${relationship.sourceEntity}'.`
        );
      }
      if (!entityKeys.has(relationship.targetEntity)) {
        errors.push(
          `Relationship references unknown target entity '${relationship.targetEntity}'.`
        );
      }
    }
    return {
      valid: errors.length === 0,
      warnings: [],
      errors
    };
  }
};

// src/validation/completeness-validator.ts
var CompletenessValidator = class {
  validate(context) {
    const warnings = [];
    const errors = [];
    this.validateAliases(context, errors);
    this.validateRequiredFields(context, errors);
    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }
  validateAliases(context, errors) {
    for (const alias of context.aliases) {
      if (alias.aliases.length === 0) {
        errors.push(
          `Alias definition '${alias.id}' must contain at least one alias.`
        );
      }
      if (this.isBlank(alias.canonical)) {
        errors.push(
          `Alias definition '${alias.id}' is missing a canonical value.`
        );
      }
    }
  }
  isBlank(value) {
    return value === void 0 || value.trim().length === 0;
  }
  validateRequiredFields(context, errors) {
    for (const entity of context.entities) {
      if (this.isBlank(entity.id)) {
        errors.push("Entity is missing an id.");
      }
    }
    for (const concept of context.concepts) {
      if (this.isBlank(concept.id)) {
        errors.push("Concept is missing an id.");
      }
    }
    for (const metric of context.metrics) {
      if (this.isBlank(metric.id)) {
        errors.push("Metric is missing an id.");
      }
    }
    for (const category of context.categories) {
      if (this.isBlank(category.id)) {
        errors.push("Category is missing an id.");
      }
    }
    for (const dimension of context.dimensions) {
      if (this.isBlank(dimension.id)) {
        errors.push("Dimension is missing an id.");
      }
    }
    for (const benchmark of context.benchmarks) {
      if (this.isBlank(benchmark.id)) {
        errors.push("Benchmark is missing an id.");
      }
    }
    for (const capability of context.capabilities) {
      if (this.isBlank(capability.id)) {
        errors.push("Capability is missing an id.");
      }
    }
    for (const recommendation of context.recommendations) {
      if (this.isBlank(recommendation.id)) {
        errors.push("Recommendation is missing an id.");
      }
    }
    for (const sqlTemplate of context.sqlTemplates) {
      if (this.isBlank(sqlTemplate.id)) {
        errors.push("SQL Template is missing an id.");
      }
    }
  }
};

// src/validation/cross-registry-validator.ts
var CrossRegistryValidator = class {
  validate(context) {
    const errors = [];
    const registry = /* @__PURE__ */ new Map();
    this.register(context.entities.map((e) => e.id), "Entity", registry, errors);
    this.register(context.concepts.map((c) => c.id), "Concept", registry, errors);
    this.register(context.metrics.map((m) => m.id), "Metric", registry, errors);
    this.register(context.categories.map((c) => c.id), "Category", registry, errors);
    this.register(context.dimensions.map((d) => d.id), "Dimension", registry, errors);
    this.register(context.benchmarks.map((b) => b.id), "Benchmark", registry, errors);
    this.register(context.capabilities.map((c) => c.id), "Capability", registry, errors);
    this.register(context.recommendations.map((r) => r.id), "Recommendation", registry, errors);
    this.register(context.sqlTemplates.map((s) => s.id), "SQL Template", registry, errors);
    return {
      valid: errors.length === 0,
      warnings: [],
      errors
    };
  }
  register(ids, type, registry, errors) {
    for (const id of ids) {
      const existing = registry.get(id);
      if (existing) {
        errors.push(
          `'${id}' exists in both ${existing} and ${type}.`
        );
        continue;
      }
      registry.set(id, type);
    }
  }
};

// src/validation/semantic-validation-engine.ts
var SemanticValidationEngine = class {
  constructor(validators) {
    this.validators = validators;
  }
  validators;
  validate(context) {
    const warnings = [];
    const errors = [];
    for (const validator of this.validators) {
      const result = validator.validate(context);
      warnings.push(...result.warnings);
      errors.push(...result.errors);
    }
    return {
      valid: errors.length === 0,
      warnings,
      errors
    };
  }
};

// src/pipeline/semantic-pipeline.ts
var SemanticPipeline = class {
  constructor(normalizer, analyzer, lexicalRewriter, phraseExtractor, aliasResolver, entityResolver, candidateBuilder, matcher, ontology) {
    this.normalizer = normalizer;
    this.analyzer = analyzer;
    this.lexicalRewriter = lexicalRewriter;
    this.phraseExtractor = phraseExtractor;
    this.aliasResolver = aliasResolver;
    this.entityResolver = entityResolver;
    this.candidateBuilder = candidateBuilder;
    this.matcher = matcher;
    this.ontology = ontology;
  }
  normalizer;
  analyzer;
  lexicalRewriter;
  phraseExtractor;
  aliasResolver;
  entityResolver;
  candidateBuilder;
  matcher;
  ontology;
  resolve(query) {
    console.log("\u{1F525} NEW SEMANTIC PIPELINE V2 \u{1F525}");
    const normalizedQuery = this.normalizer.normalize(query);
    console.log("========== SEMANTIC ==========");
    console.log("Original :", query);
    console.log("Normalized :", normalizedQuery);
    const analyzed = this.analyzer.analyze(normalizedQuery);
    console.log("Analyzed Tokens:");
    for (const token of analyzed) {
      console.log(token.token.value, "\u2192", token.role);
    }
    const rewritten = this.lexicalRewriter.rewrite(normalizedQuery);
    console.log("Rewritten:");
    console.log(rewritten.rewritten);
    const rewrittenTokens = rewritten.rewritten.split(" ").filter(Boolean).map((value, position) => ({
      value,
      position
    }));
    const phrases = this.phraseExtractor.extract(rewrittenTokens);
    console.log("Phrases:");
    for (const phrase of phrases) {
      console.log("-", phrase.value);
    }
    const semanticCandidates = [];
    for (const phrase of phrases) {
      const aliasResult = this.aliasResolver.resolve(phrase.value);
      if (aliasResult.matched) {
        const ontologyResult3 = this.ontology.resolve(aliasResult.canonicalKey);
        if (ontologyResult3.found) {
          semanticCandidates.push(
            this.candidateBuilder.build(
              phrase.value,
              ontologyResult3.canonicalKey,
              ontologyResult3.semanticType,
              ontologyResult3.definition,
              1
            )
          );
        }
        continue;
      }
      const entity = this.entityResolver.resolve(phrase.value);
      if (!entity.found) {
        continue;
      }
      const ontologyResult2 = this.ontology.resolve(entity.entityId);
      if (!ontologyResult2.found) {
        continue;
      }
      const candidate = this.candidateBuilder.build(
        phrase.value,
        ontologyResult2.canonicalKey,
        ontologyResult2.semanticType,
        ontologyResult2.definition,
        1
      );
      candidate.resolvedValue = entity.value;
      semanticCandidates.push(candidate);
    }
    console.log("========== SEMANTIC CANDIDATES ==========");
    for (const candidate of semanticCandidates) {
      console.log({
        phrase: candidate.phrase,
        canonical: candidate.canonicalKey,
        type: candidate.semanticType
      });
    }
    console.log("=========================================");
    for (const candidate of semanticCandidates) {
      console.dir(candidate, { depth: null });
    }
    console.log(JSON.stringify(semanticCandidates, null, 2));
    const matchResult = this.matcher.match(
      semanticCandidates.map((candidate) => candidate.canonicalKey)
    );
    const ontologyResult = this.ontology.resolve(matchResult.canonicalKey);
    return {
      resolved: ontologyResult.found,
      originalQuery: query,
      normalizedQuery,
      canonicalKey: ontologyResult.canonicalKey,
      semanticType: ontologyResult.semanticType,
      matches: semanticCandidates
    };
  }
};

// src/tokenizer/tokenizer.ts
var Tokenizer = class {
  tokenize(text) {
    return text.split(" ").filter(Boolean).map((value, position) => ({
      value,
      position
    }));
  }
};

// src/analyzer/lexicon.ts
var MODIFIERS = /* @__PURE__ */ new Set([
  "highest",
  "lowest",
  "best",
  "worst",
  "top",
  "bottom",
  "largest",
  "smallest"
]);
var OPERATORS = /* @__PURE__ */ new Set([
  "greater",
  "less",
  "above",
  "below",
  "between"
]);
var STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "of",
  "for",
  "to",
  "in",
  "on"
]);

// src/analyzer/semantic-analyzer.ts
var SemanticAnalyzer = class {
  constructor(tokenizer = new Tokenizer()) {
    this.tokenizer = tokenizer;
  }
  tokenizer;
  analyze(text) {
    const tokens = this.tokenizer.tokenize(text);
    return tokens.map((token) => ({
      token,
      role: this.classify(token.value)
    }));
  }
  classify(value) {
    if (MODIFIERS.has(value)) {
      return "modifier";
    }
    if (OPERATORS.has(value)) {
      return "operator";
    }
    if (!Number.isNaN(Number(value))) {
      return "number";
    }
    if (STOPWORDS.has(value)) {
      return "unknown";
    }
    return "noun";
  }
};

// src/phrase/phrase-extractor.ts
var PhraseExtractor = class {
  extract(tokens) {
    const phrases = [];
    for (let start = 0; start < tokens.length; start++) {
      for (let end = start; end < tokens.length; end++) {
        phrases.push({
          value: tokens.slice(start, end + 1).map((t) => t.value).join(" "),
          start,
          end
        });
      }
    }
    return phrases;
  }
};

// src/rewriter/lexical-rewriter.ts
var LexicalRewriter = class {
  rewrite(text) {
    let rewritten = text;
    rewritten = rewritten.replace(
      /\bhighest rated hospitals\b/g,
      "hospital overall rating"
    );
    rewritten = rewritten.replace(
      /\bbest hospitals\b/g,
      "hospital overall rating"
    );
    rewritten = rewritten.replace(
      /\btop hospitals\b/g,
      "hospital overall rating"
    );
    rewritten = rewritten.split(" ").filter(
      (word) => !MODIFIERS.has(word)
    ).join(" ");
    return {
      original: text,
      rewritten
    };
  }
};

// src/candidate/SemanticCandidateBuilder.ts
var SemanticCandidateBuilder = class {
  build(phrase, canonicalKey, semanticType, definition, confidence = 1) {
    return {
      phrase,
      canonicalKey,
      semanticType,
      definition,
      confidence,
      start: 0,
      end: 0
    };
  }
};

// src/entity/entity-resolver.ts
var EntityResolver = class {
  constructor(provider) {
    this.provider = provider;
  }
  provider;
  resolve(phrase) {
    return this.provider.resolve(phrase);
  }
};

// src/create-semantic-resolver.ts
function createSemanticResolver(registry, entityProvider) {
  const pipeline = new SemanticPipeline(
    new Normalizer(),
    new SemanticAnalyzer(),
    new LexicalRewriter(),
    new PhraseExtractor(),
    new AliasResolver(registry.getAliases()),
    new EntityResolver(entityProvider),
    new SemanticCandidateBuilder(),
    new Matcher(),
    new Ontology(registry)
  );
  return new SemanticResolver(pipeline);
}

// src/registry/semantic-registry.ts
var SemanticRegistry = class {
  constructor(data) {
    this.data = data;
  }
  data;
  getAliases() {
    return this.data.aliases;
  }
  getMetric(metricId) {
    return this.data.metrics.get(metricId);
  }
  getEntity(entityId) {
    return this.data.entities.get(entityId);
  }
  getConcept(conceptId) {
    return this.data.concepts.get(conceptId);
  }
  getCategory(categoryId) {
    return this.data.categories.get(categoryId);
  }
  getRelationship(relationshipId) {
    return this.data.relationships.get(
      relationshipId
    );
  }
  getDimension(dimensionId) {
    return this.data.dimensions.get(
      dimensionId
    );
  }
  getBenchmark(benchmarkId) {
    return this.data.benchmarks.get(
      benchmarkId
    );
  }
  hasMetric(metricKey) {
    return this.data.metrics.has(metricKey);
  }
  hasEntity(entityKey) {
    return this.data.entities.has(entityKey);
  }
  hasConcept(conceptKey) {
    return this.data.concepts.has(conceptKey);
  }
  hasCategory(categoryKey) {
    return this.data.categories.has(categoryKey);
  }
  hasRelationship(relationshipKey) {
    return this.data.relationships.has(relationshipKey);
  }
  hasDimension(dimensionKey) {
    return this.data.dimensions.has(dimensionKey);
  }
  hasBenchmark(benchmarkKey) {
    return this.data.benchmarks.has(benchmarkKey);
  }
  getSemanticType(canonicalKey) {
    if (this.data.metrics.has(canonicalKey)) {
      return "metric";
    }
    if (this.data.entities.has(canonicalKey)) {
      return "entity";
    }
    if (this.data.concepts.has(canonicalKey)) {
      return "concept";
    }
    if (this.data.categories.has(canonicalKey)) {
      return "category";
    }
    if (this.data.relationships.has(canonicalKey)) {
      return "relationship";
    }
    if (this.data.dimensions.has(canonicalKey)) {
      return "dimension";
    }
    if (this.data.benchmarks.has(canonicalKey)) {
      return "benchmark";
    }
    return null;
  }
};

// src/registry/semantic-registry-builder.ts
var SemanticRegistryBuilder = class {
  aliases = /* @__PURE__ */ new Map();
  metrics = /* @__PURE__ */ new Map();
  entities = /* @__PURE__ */ new Map();
  concepts = /* @__PURE__ */ new Map();
  categories = /* @__PURE__ */ new Map();
  relationships = /* @__PURE__ */ new Map();
  dimensions = /* @__PURE__ */ new Map();
  benchmarks = /* @__PURE__ */ new Map();
  addAlias(alias, canonicalKey) {
    this.aliases.set(alias, canonicalKey);
    return this;
  }
  addMetric(metric) {
    this.metrics.set(metric.id, metric);
    return this;
  }
  addEntity(entity) {
    this.entities.set(entity.id, entity);
    return this;
  }
  addCategory(category) {
    this.categories.set(category.id, category);
    return this;
  }
  addConcept(concept) {
    this.concepts.set(concept.id, concept);
    return this;
  }
  addRelationship(relationship) {
    this.relationships.set(
      relationship.id,
      relationship
    );
    return this;
  }
  addDimension(dimension) {
    this.dimensions.set(
      dimension.id,
      dimension
    );
    return this;
  }
  addBenchmark(benchmark) {
    this.benchmarks.set(
      benchmark.id,
      benchmark
    );
    return this;
  }
  build() {
    const data = {
      aliases: this.aliases,
      metrics: this.metrics,
      entities: this.entities,
      concepts: this.concepts,
      categories: this.categories,
      dimensions: this.dimensions,
      relationships: this.relationships,
      benchmarks: this.benchmarks
    };
    return new SemanticRegistry(data);
  }
};
export {
  AliasResolver,
  CompletenessValidator,
  CrossRegistryValidator,
  DuplicateValidator,
  LexicalRewriter,
  Matcher,
  Normalizer,
  Ontology,
  PhraseExtractor,
  ReferenceValidator,
  RelationshipValidator,
  SemanticAnalyzer,
  SemanticCandidateBuilder,
  SemanticPipeline,
  SemanticRegistry,
  SemanticRegistryBuilder,
  SemanticResolver,
  SemanticValidationEngine,
  Tokenizer,
  createSemanticResolver
};
