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
  constructor(normalizer, analyzer, lexicalRewriter, phraseExtractor, aliasResolver, entityResolver, candidateBuilder, matcher, ontology, directionResolver, temporalResolver) {
    this.normalizer = normalizer;
    this.analyzer = analyzer;
    this.lexicalRewriter = lexicalRewriter;
    this.phraseExtractor = phraseExtractor;
    this.aliasResolver = aliasResolver;
    this.entityResolver = entityResolver;
    this.candidateBuilder = candidateBuilder;
    this.matcher = matcher;
    this.ontology = ontology;
    this.directionResolver = directionResolver;
    this.temporalResolver = temporalResolver;
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
  directionResolver;
  temporalResolver;
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
    const temporalCandidates = this.temporalResolver.resolve(rewrittenTokens);
    let semanticCandidates = [];
    const identityAmbiguities = [];
    const identityConflicts = [];
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
              1,
              phrase.start,
              phrase.end
            )
          );
        }
        continue;
      }
      const entity = this.entityResolver.resolve(phrase.value);
      if (!entity.found) {
        if (entity.status === "ambiguous") {
          identityAmbiguities.push({
            start: phrase.start,
            end: phrase.end,
            result: entity
          });
        } else if (entity.status === "not_found" && entity.entityId && entity.phrase) {
          identityConflicts.push({
            start: phrase.start,
            end: phrase.end,
            entityId: entity.entityId,
            phrase: entity.phrase
          });
        }
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
        1,
        phrase.start,
        phrase.end
      );
      candidate.resolvedValue = entity.value;
      semanticCandidates.push(candidate);
    }
    semanticCandidates = semanticCandidates.filter((inner) => {
      if (inner.semanticType !== "entity") {
        return true;
      }
      return !semanticCandidates.some(
        (outer) => outer !== inner && outer.semanticType === "entity" && outer.start <= inner.start && outer.end >= inner.end && (outer.start < inner.start || outer.end > inner.end)
      );
    });
    semanticCandidates = semanticCandidates.filter((candidate) => {
      if (candidate.semanticType !== "entity") {
        return true;
      }
      const conflicts = identityConflicts.filter(
        (conflict) => conflict.entityId === candidate.canonicalKey && conflict.phrase === candidate.phrase && conflict.start <= candidate.start && conflict.end >= candidate.end
      );
      if (conflicts.length === 0) {
        return true;
      }
      const otherSameTypeCandidates = semanticCandidates.filter(
        (other) => other !== candidate && other.canonicalKey === candidate.canonicalKey
      );
      const safeToSuppress = otherSameTypeCandidates.length === 0 || otherSameTypeCandidates.some(
        (other) => other.resolvedValue === candidate.resolvedValue
      );
      return !safeToSuppress;
    });
    const resolvedEntitySpans = semanticCandidates.filter(
      (candidate) => candidate.semanticType === "entity"
    );
    semanticCandidates = semanticCandidates.filter((candidate) => {
      if (candidate.semanticType === "entity") {
        return true;
      }
      return !resolvedEntitySpans.some(
        (entityCandidate) => entityCandidate.start <= candidate.start && entityCandidate.end >= candidate.end
      );
    });
    const candidateSuppressedIdentityAmbiguities = identityAmbiguities.filter(
      (ambiguity) => !resolvedEntitySpans.some(
        (candidate) => candidate.canonicalKey === ambiguity.result.entityId && ambiguity.start <= candidate.end && candidate.start <= ambiguity.end
      )
    );
    const filteredIdentityAmbiguities = candidateSuppressedIdentityAmbiguities.filter(
      (inner) => !candidateSuppressedIdentityAmbiguities.some(
        (outer) => outer !== inner && outer.result.entityId === inner.result.entityId && outer.start <= inner.start && outer.end >= inner.end && (outer.start < inner.start || outer.end > inner.end)
      )
    );
    for (const candidate of semanticCandidates) {
      if (candidate.semanticType !== "metric") {
        continue;
      }
      candidate.isFallback = rewritten.appliedReplacements.some(
        (applied) => applied.replacement.includes(candidate.phrase)
      );
    }
    const modifierTokenIndices = analyzed.map((analyzedToken, index) => ({ role: analyzedToken.role, index })).filter((entry) => entry.role === "modifier").map((entry) => entry.index);
    const originalTokenValues = analyzed.map(
      (analyzedToken) => analyzedToken.token.value
    );
    for (const candidate of semanticCandidates) {
      if (candidate.semanticType !== "metric") {
        continue;
      }
      const direction = this.directionResolver.resolve(
        originalTokenValues,
        modifierTokenIndices,
        candidate.phrase
      );
      if (direction) {
        candidate.direction = direction;
      }
    }
    for (const candidate of semanticCandidates) {
      if (candidate.semanticType !== "metric" || !candidate.isFallback || candidate.direction) {
        continue;
      }
      const matchedRule = rewritten.appliedReplacements.find(
        (applied) => applied.replacement.includes(candidate.phrase)
      );
      if (!matchedRule) {
        continue;
      }
      const direction = this.directionResolver.resolveFromText(
        matchedRule.pattern
      );
      if (direction) {
        candidate.direction = direction;
      }
    }
    const metricCandidates = semanticCandidates.filter(
      (candidate) => candidate.semanticType === "metric"
    );
    const distinctMetricKeys = new Set(
      metricCandidates.map((candidate) => candidate.canonicalKey)
    );
    let ambiguityError;
    if (distinctMetricKeys.size === 1) {
      const contradiction = this.directionResolver.detectContradiction(
        originalTokenValues,
        modifierTokenIndices
      );
      if (contradiction) {
        ambiguityError = `I'm seeing both "${contradiction.ascendingWord}" and "${contradiction.descendingWord}" applied to the same ranking, so I'm not sure which direction you'd like - highest to lowest, or lowest to highest?`;
      }
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
    const unsupportedNegation = analyzed.some(
      (analyzedToken) => analyzedToken.role === "negator"
    );
    return {
      resolved: ontologyResult.found,
      originalQuery: query,
      normalizedQuery,
      canonicalKey: ontologyResult.canonicalKey,
      semanticType: ontologyResult.semanticType,
      matches: semanticCandidates,
      ...ambiguityError !== void 0 ? { ambiguityError } : {},
      ...unsupportedNegation ? { unsupportedNegation } : {},
      ...filteredIdentityAmbiguities.length > 0 ? { identityAmbiguities: filteredIdentityAmbiguities.map((a) => a.result) } : {},
      ...temporalCandidates.length > 0 ? { temporalCandidates } : {}
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
var NEGATORS = /* @__PURE__ */ new Set([
  "not",
  "excluding",
  "without",
  "except"
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
    if (NEGATORS.has(value)) {
      return "negator";
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
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var LexicalRewriter = class {
  constructor(rules = []) {
    this.rules = rules;
  }
  rules;
  rewrite(text) {
    let rewritten = text;
    const appliedReplacements = [];
    for (const rule of this.rules) {
      const before = rewritten;
      rewritten = rewritten.replace(
        new RegExp(`\\b${escapeRegExp(rule.pattern)}\\b`, "g"),
        rule.replacement
      );
      if (rewritten !== before) {
        appliedReplacements.push({
          pattern: rule.pattern,
          replacement: rule.replacement
        });
      }
    }
    rewritten = rewritten.split(" ").filter(
      (word) => !MODIFIERS.has(word)
    ).join(" ");
    return {
      original: text,
      rewritten,
      appliedReplacements
    };
  }
};

// src/candidate/SemanticCandidateBuilder.ts
var SemanticCandidateBuilder = class {
  build(phrase, canonicalKey, semanticType, definition, confidence = 1, start = 0, end = 0) {
    return {
      phrase,
      canonicalKey,
      semanticType,
      definition,
      confidence,
      start,
      end
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

// src/direction/modifier-direction-lexicon.ts
var DESCENDING_MODIFIERS = /* @__PURE__ */ new Set([
  "highest",
  "best",
  "top",
  "largest"
]);
var ASCENDING_MODIFIERS = /* @__PURE__ */ new Set([
  "lowest",
  "worst",
  "bottom",
  "smallest"
]);

// src/direction/modifier-direction-resolver.ts
var ModifierDirectionResolver = class {
  resolve(originalTokens, modifierTokenIndices, candidatePhrase) {
    if (modifierTokenIndices.length === 0) {
      return void 0;
    }
    const phraseWords = candidatePhrase.split(" ").filter(Boolean);
    if (phraseWords.length === 0) {
      return void 0;
    }
    const span = this.findSpan(originalTokens, phraseWords);
    if (!span) {
      return void 0;
    }
    const nearestIndex = this.findNearestModifier(modifierTokenIndices, span);
    if (nearestIndex === void 0) {
      return void 0;
    }
    const modifierWord = originalTokens[nearestIndex];
    if (!modifierWord) {
      return void 0;
    }
    if (DESCENDING_MODIFIERS.has(modifierWord)) {
      return "desc";
    }
    if (ASCENDING_MODIFIERS.has(modifierWord)) {
      return "asc";
    }
    return void 0;
  }
  /**
   * Finds the first contiguous occurrence of `words` within `tokens`.
   * Plain sequential array comparison — no regex.
   */
  findSpan(tokens, words) {
    for (let start = 0; start <= tokens.length - words.length; start++) {
      let matched = true;
      for (let offset = 0; offset < words.length; offset++) {
        if (tokens[start + offset] !== words[offset]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return { start, end: start + words.length - 1 };
      }
    }
    return void 0;
  }
  /**
   * Finds the modifier token index nearest to `span` by absolute token
   * distance. On an exact tie, prefers the modifier preceding the span
   * (English convention: a superlative modifier typically precedes the
   * noun phrase it modifies, e.g. "best rating", "lowest mortality").
   */
  findNearestModifier(modifierTokenIndices, span) {
    let best;
    for (const modifierIndex of modifierTokenIndices) {
      let distance;
      let precedes;
      if (modifierIndex < span.start) {
        distance = span.start - modifierIndex;
        precedes = true;
      } else if (modifierIndex > span.end) {
        distance = modifierIndex - span.end;
        precedes = false;
      } else {
        continue;
      }
      const isCloser = best === void 0 || distance < best.distance;
      const isTieButPrecedes = best !== void 0 && distance === best.distance && precedes && !best.precedes;
      if (isCloser || isTieButPrecedes) {
        best = { index: modifierIndex, distance, precedes };
      }
    }
    return best?.index;
  }
  /**
   * Classifies a direction directly from a piece of arbitrary text (e.g.
   * a domain's lexical-rewrite rule pattern, such as "worst hospitals")
   * by checking whether any of its words is a recognized superlative
   * modifier - no span or token-distance logic, no candidate-phrase
   * search.
   *
   * Used when a candidate's own phrase cannot be located in the
   * original text at all - a fallback/rewrite-derived candidate, whose
   * phrase only exists after the rewrite ran (see RCG-020) - so the
   * ordinary resolve() method's span-based approach can never apply.
   * Generic, domain-agnostic: the caller supplies arbitrary text: this
   * method never inspects domain or metric identity.
   */
  resolveFromText(text) {
    const words = text.split(" ").filter(Boolean);
    for (const word of words) {
      if (DESCENDING_MODIFIERS.has(word)) {
        return "desc";
      }
      if (ASCENDING_MODIFIERS.has(word)) {
        return "asc";
      }
    }
    return void 0;
  }
  /**
   * RCG-010: detects a genuine direction contradiction - both an
   * ascending and a descending modifier present among the given
   * indices - as distinct from a legitimate "from X to Y" range/order
   * expression (e.g. "rank hospitals from best to worst"), which is
   * not a contradiction and must be left alone.
   *
   * Domain-agnostic and candidate-agnostic: only ever inspects the
   * existing generic ASCENDING_MODIFIERS/DESCENDING_MODIFIERS sets and
   * the ordinary English words "from"/"to" - never a domain-specific
   * word, never a regex. Callers are responsible for first confirming
   * this check should even apply (see SemanticPipeline: only when the
   * query names exactly one distinct metric - a genuine cross-metric
   * query, e.g. "highest rating and lowest mortality", legitimately
   * carries an ascending and a descending modifier for two DIFFERENT
   * candidates, which is not a contradiction and must never reach this
   * method at all).
   *
   * The range/order exemption is intentionally narrow: exactly one
   * ascending and one descending modifier, with "from" immediately
   * preceding whichever comes first in the text and "to" immediately
   * preceding whichever comes second. Any other shape (three or more
   * conflicting modifiers, or two conflicting modifiers not connected
   * by "from ... to ...") is reported as a contradiction rather than
   * guessed at.
   */
  detectContradiction(originalTokens, modifierTokenIndices) {
    const ascendingIndices = modifierTokenIndices.filter(
      (index) => ASCENDING_MODIFIERS.has(originalTokens[index] ?? "")
    );
    const descendingIndices = modifierTokenIndices.filter(
      (index) => DESCENDING_MODIFIERS.has(originalTokens[index] ?? "")
    );
    if (ascendingIndices.length === 0 || descendingIndices.length === 0) {
      return void 0;
    }
    if (ascendingIndices.length === 1 && descendingIndices.length === 1) {
      const sorted = [ascendingIndices[0], descendingIndices[0]].sort(
        (a, b) => a - b
      );
      const firstIndex = sorted[0];
      const secondIndex = sorted[1];
      if (originalTokens[firstIndex - 1] === "from" && originalTokens[secondIndex - 1] === "to") {
        return void 0;
      }
    }
    return {
      ascendingWord: originalTokens[ascendingIndices[0]],
      descendingWord: originalTokens[descendingIndices[0]]
    };
  }
};

// src/temporal/temporal-resolver.ts
var MIN_YEAR = 1900;
var MAX_YEAR = 2100;
var TemporalResolver = class {
  resolve(tokens) {
    const candidates = [];
    for (const token of tokens) {
      if (token.value.length !== 4) {
        continue;
      }
      const value = Number(token.value);
      if (Number.isNaN(value) || !Number.isInteger(value)) {
        continue;
      }
      if (value < MIN_YEAR || value > MAX_YEAR) {
        continue;
      }
      candidates.push({
        kind: "year",
        value,
        span: { start: token.position, end: token.position }
      });
    }
    return candidates;
  }
};

// src/create-semantic-resolver.ts
function createSemanticResolver(registry, entityProvider) {
  const pipeline = new SemanticPipeline(
    new Normalizer(),
    new SemanticAnalyzer(),
    new LexicalRewriter(registry.getLexicalRewrites()),
    new PhraseExtractor(),
    new AliasResolver(registry.getAliases()),
    new EntityResolver(entityProvider),
    new SemanticCandidateBuilder(),
    new Matcher(),
    new Ontology(registry),
    new ModifierDirectionResolver(),
    new TemporalResolver()
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
  getLexicalRewrites() {
    return this.data.lexicalRewrites;
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
  lexicalRewrites = [];
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
  addLexicalRewrite(rule) {
    this.lexicalRewrites.push(rule);
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
      lexicalRewrites: this.lexicalRewrites,
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
  ASCENDING_MODIFIERS,
  AliasResolver,
  CompletenessValidator,
  CrossRegistryValidator,
  DESCENDING_MODIFIERS,
  DuplicateValidator,
  LexicalRewriter,
  Matcher,
  ModifierDirectionResolver,
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
  TemporalResolver,
  Tokenizer,
  createSemanticResolver
};
