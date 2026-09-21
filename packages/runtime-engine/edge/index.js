// src/create-runtime-engine.ts
import { assessPlanCompleteness, hasRelationshipWithoutBenchmark, detectSubsumedBenchmarkRisk } from "@intelligence/query-planner";

// src/build-clarification-message.ts
function isAmbiguousCandidate(value) {
  return typeof value === "object" && value !== null && "value" in value;
}
function candidateLabel(candidate) {
  if (isAmbiguousCandidate(candidate)) {
    return typeof candidate.label === "string" ? candidate.label : String(candidate.value);
  }
  return String(candidate);
}
function buildClarificationMessage(identityAmbiguities) {
  const clauses = identityAmbiguities.map((ambiguity) => {
    const subject = ambiguity.phrase && ambiguity.phrase.length > 0 ? ambiguity.phrase : "entity";
    const labels = (ambiguity.candidates ?? []).map(candidateLabel);
    return `Which ${subject} do you mean \u2014 ${labels.join(" or ")}?`;
  });
  return clauses.join(" ");
}

// src/build-guidance-message.ts
function resolveMetricLabel(capabilityId, metrics) {
  const metric = metrics.find((m) => m.id === capabilityId);
  if (!metric) {
    return null;
  }
  return metric.displayName;
}
function buildGuidanceMessage(answerability, metrics) {
  if (answerability.status !== "not_directly_answerable" || answerability.reason !== "capability-unavailable" || !answerability.alternatives || answerability.alternatives.length === 0) {
    return null;
  }
  const labels = [];
  for (const alternative of answerability.alternatives) {
    const label = resolveMetricLabel(alternative.capabilityId, metrics);
    if (label !== null) {
      labels.push(label);
    }
  }
  if (labels.length === 0) {
    return null;
  }
  const alternativesList = labels.length === 1 ? labels[0] : labels.length === 2 ? `${labels[0]} or ${labels[1]}` : `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
  return `I can't answer this using the requested capability because it isn't currently available. I can help with ${alternativesList} instead.`;
}

// src/phase-gate-tracker.ts
var PhaseGateTracker = class {
  requestId;
  query;
  gates = [];
  constructor(requestId, query) {
    this.requestId = requestId;
    this.query = query;
  }
  enter(phase) {
    this.gates.push({ phase, timestamp: Date.now(), status: "enter", sqlCalls: 0 });
  }
  exit(phase, status, sqlCalls, answerability, detail) {
    this.gates.push({
      phase,
      timestamp: Date.now(),
      status,
      sqlCalls,
      ...answerability !== void 0 ? { answerability } : {},
      ...detail !== void 0 ? { detail } : {}
    });
  }
  /**
   * Checks that every phase in `required` was visited at least once.
   * `required` is caller-supplied rather than hardcoded: which gates a
   * given request *should* visit depends on what kind of request it is
   * (e.g. a Layer 2 continuation visits "layer2-continuation"; an
   * ordinary Turn 1 query never does) and on which phases are actually
   * built yet (Phase 9-11 "memory"/"insight" gates don't exist in the
   * codebase yet and are never asserted here - asserting them
   * unconditionally would make every current query "fail" a check for a
   * phase that cannot possibly run, which proves nothing).
   */
  verifyAllPhasesVisited(required) {
    return required.every((phase) => this.gates.some((gate) => gate.phase === phase));
  }
  totalSqlCalls() {
    return this.gates.reduce((sum, gate) => sum + gate.sqlCalls, 0);
  }
};

// src/create-runtime-engine.ts
function valuesMatch(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}
function isFilterCompatibleWithTemplate(filter, resolvedParameters, templateParameters) {
  if (filter.operator !== "in") {
    return true;
  }
  const matchingParameter = templateParameters.find(
    (parameter) => valuesMatch(resolvedParameters[parameter.name], filter.value)
  );
  return matchingParameter?.type === "array";
}
var ALTERNATIVE_OPERATION_FLAG = {
  rank: "rankable",
  aggregate: "aggregatable",
  compare: "comparable"
};
function discoverAlternatives(unavailableMetricId, executionPlan, runtime) {
  const requiredFlag = ALTERNATIVE_OPERATION_FLAG[executionPlan.operation];
  const { executionStrategy } = runtime.domain;
  if (!requiredFlag || !executionStrategy.selectTemplateFromPlan || !executionStrategy.resolveParametersFromPlan) {
    return [];
  }
  const parameters = executionStrategy.resolveParametersFromPlan(executionPlan);
  const alternatives = [];
  for (const candidate of runtime.domain.metrics) {
    if (candidate.id === unavailableMetricId || !candidate[requiredFlag]) {
      continue;
    }
    const candidateTemplateId = executionStrategy.selectTemplateFromPlan(
      { ...executionPlan, metric: candidate.id }
    );
    const candidateTemplate = runtime.sqlResolver.resolve(candidateTemplateId);
    if (!candidateTemplate.found || !candidateTemplate.template || candidateTemplate.template.enabled === false) {
      continue;
    }
    const candidateTemplateParameters = candidateTemplate.template.parameters ?? [];
    const isCompatible = executionPlan.filters.every(
      (filter) => isFilterCompatibleWithTemplate(filter, parameters, candidateTemplateParameters)
    );
    if (isCompatible) {
      alternatives.push({ capabilityId: candidate.id });
    }
  }
  return alternatives;
}
function isLlmFirstFrontDoorEnabled() {
  const env = globalThis.process?.env;
  return env?.LLM_FIRST_FRONT_DOOR_ENABLED === "true";
}
function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor,
  llmFallback,
  preprocessQuestion
}) {
  const engine = {
    async execute(incomingRequest) {
      const request = preprocessQuestion ? { ...incomingRequest, question: preprocessQuestion(incomingRequest.question) } : incomingRequest;
      const tracker = new PhaseGateTracker(
        request.requestId ?? crypto.randomUUID(),
        request.question
      );
      let frontDoorUnaccounted = [];
      let capturedExecutionPlan;
      const runPipeline = async () => {
        console.log(">>> RuntimeEngine.execute()");
        tracker.enter("semantic-candidate-resolution");
        const semanticResult = semantic.resolve(request.question);
        tracker.exit(
          "semantic-candidate-resolution",
          semanticResult.resolved ? "ok" : "unresolved",
          0
        );
        console.log("========== SEMANTIC RESULT ==========");
        console.log(
          JSON.stringify(semanticResult, null, 2)
        );
        console.log("=====================================");
        if (request.forcedIdentityCandidate && semanticResult.identityAmbiguities) {
          const forcedValue = request.forcedIdentityCandidate.value;
          const matchIndex = semanticResult.identityAmbiguities.findIndex(
            (ambiguity) => (ambiguity.candidates ?? []).some(
              (candidate) => valuesMatch(candidate, forcedValue) || valuesMatch(candidate?.value, forcedValue)
            )
          );
          if (matchIndex !== -1) {
            const resolvedAmbiguity = semanticResult.identityAmbiguities.splice(matchIndex, 1)[0];
            const entityDefinition = resolvedAmbiguity.entityId ? runtime.registry.getEntity(resolvedAmbiguity.entityId) : void 0;
            if (entityDefinition) {
              semanticResult.matches.push({
                phrase: resolvedAmbiguity.phrase ?? "",
                canonicalKey: resolvedAmbiguity.entityId,
                semanticType: "entity",
                definition: entityDefinition,
                confidence: 1,
                start: 0,
                end: 0,
                resolvedValue: forcedValue
              });
            }
          }
        }
        if (request.companionEntities && request.companionEntities.length > 0) {
          for (const companion of request.companionEntities) {
            const entityDefinition = runtime.registry.getEntity(companion.canonicalKey);
            const settledIndex = (semanticResult.identityAmbiguities ?? []).findIndex(
              (ambiguity) => (ambiguity.candidates ?? []).some(
                (candidate) => valuesMatch(candidate, companion.value) || valuesMatch(candidate?.value, companion.value)
              )
            );
            if (settledIndex !== -1) {
              semanticResult.identityAmbiguities.splice(settledIndex, 1);
            }
            if (entityDefinition) {
              semanticResult.matches.push({
                phrase: "",
                // Companion entity phrase not needed for execution
                canonicalKey: companion.canonicalKey,
                semanticType: "entity",
                definition: entityDefinition,
                confidence: 1,
                start: 0,
                end: 0,
                resolvedValue: companion.value
              });
            }
          }
        }
        if (!semanticResult.resolved && semanticResult.matches.length > 0) {
          semanticResult.resolved = true;
        }
        tracker.enter("entity-identity-ambiguity");
        const identitiesPinnedByContinuation = request.identityAlreadyResolved === true || request.forcedIdentityCandidate !== void 0 || (request.companionEntities?.length ?? 0) > 0;
        if (!identitiesPinnedByContinuation && semanticResult.identityNotFound && semanticResult.identityNotFound.length > 0) {
          const missing = semanticResult.identityNotFound[0];
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: `I couldn't find a ${missing.entityId} matching "${missing.phrase}" in the place you named, so I can't answer about it. Check the name and the place, or ask about ${missing.entityId}s there in general.`,
            answerability: { status: "not_directly_answerable", reason: "data-unavailable" }
          };
        }
        if (semanticResult.identityAmbiguities && semanticResult.identityAmbiguities.length > 0) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: buildClarificationMessage(semanticResult.identityAmbiguities),
            answerability: {
              status: "ambiguous",
              reason: "identity-ambiguous",
              candidates: semanticResult.identityAmbiguities.flatMap(
                (ambiguity) => ambiguity.candidates ?? []
              )
            },
            // Tier0 Task 6: carries this Turn's already-resolved metric/
            // concept/etc candidates (never the ambiguous entity itself)
            // forward, so a Layer 2 continuation's pending interaction can
            // store real reconstruction context in `originalSemanticResult`
            // instead of an empty placeholder.
            semanticMatches: semanticResult.matches
          };
        }
        if (!semanticResult.resolved) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: "Unable to resolve question.",
            // LLM Integration Layer 1: "semantic-incomplete" is the same
            // already-declared reason line ~397 below attaches for the
            // conceptually identical "nothing meaningful extracted from
            // the request at all" case (see AnswerabilityReason's own doc
            // comment) - reused, not invented, so the outer execute()
            // wrapper can precisely target only this dead-end shape for
            // an LLM rewrite attempt, never any other refusal reason.
            answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" }
          };
        }
        if (request.rewrittenFrom) {
          const dropped = planner.findUnaccountedWords(
            semanticResult.normalizedQuery,
            semanticResult.matches,
            runtime.domain.entities,
            request.rewrittenFrom
          );
          if (dropped.length > 0) {
            tracker.enter("unaccounted-word-guard");
            tracker.exit("unaccounted-word-guard", "refused", 0, "not_directly_answerable", {
              unaccountedWords: dropped.join(" ")
            });
            return {
              success: false,
              rows: [],
              rowCount: 0,
              error: "Unable to resolve question.",
              answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" }
            };
          }
        } else if (frontDoorUnaccounted.length > 0) {
          tracker.enter("unaccounted-word-guard");
          tracker.exit("unaccounted-word-guard", "annotated", 0, void 0, {
            unaccountedWords: frontDoorUnaccounted.join(" "),
            scope: "front-door-declined"
          });
        }
        if (semanticResult.unsupportedNegation) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: 'This question includes an exclusion or negation (e.g. "excluding", "without", "except", "not") that IntelligenceOS cannot yet safely represent. Please rephrase without excluding/negating a value.',
            answerability: { status: "not_directly_answerable" }
          };
        }
        if (hasRelationshipWithoutBenchmark(semanticResult.matches)) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: 'This question compares against a reference value (e.g. "above", "below") but does not name one IntelligenceOS recognizes (e.g. "national average", "state average"). Please include the specific reference value you mean.',
            answerability: {
              status: "ambiguous",
              reason: "candidate-inconsistent"
            }
          };
        }
        const subsumedBenchmarkRisk = detectSubsumedBenchmarkRisk(
          semanticResult.matches,
          semanticResult.normalizedQuery,
          runtime.domain.aliases
        );
        if (subsumedBenchmarkRisk) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: `This question mentions "${subsumedBenchmarkRisk.parentPhrase}", but the words aren't placed together, so I can't confirm you meant that specific comparison rather than a plain "${subsumedBenchmarkRisk.fallbackPhrase}". Please rephrase so "${subsumedBenchmarkRisk.parentPhrase}" appears together (e.g. "above the ${subsumedBenchmarkRisk.parentPhrase}").`,
            answerability: {
              status: "ambiguous",
              reason: "candidate-inconsistent"
            }
          };
        }
        const plan = planner.createPlan(semanticResult, runtime.domain.metrics, request.forcedIntent, runtime.domain.entities);
        if (!plan.success || !plan.plan || plan.plan.semantic.metrics.length === 0) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            // RCG-010: prefer a specific, natural-language reason (e.g. a
            // detected direction contradiction) when the planner supplied one.
            error: plan.error ?? "Unable to create query plan.",
            // Phase 8.1: plan.error is set only by RCG-010's direction-
            // contradiction check inside QueryPlanner.createPlan() - its presence
            // is the existing, generic signal distinguishing "the semantic
            // candidates contradict each other" from "there was nothing to plan
            // at all" (e.g. zero resolved metrics, even after Fix Cycle 018's
            // comparable-metric discovery).
            answerability: plan.error ? { status: "ambiguous", reason: "candidate-inconsistent" } : { status: "not_directly_answerable", reason: "semantic-incomplete" }
          };
        }
        tracker.enter("execution-plan-building");
        const executionPlan = executionPlanMapper.map(plan.plan);
        capturedExecutionPlan = executionPlan;
        console.log("========== EXECUTION PLAN ==========");
        console.log(JSON.stringify(executionPlan, null, 2));
        console.log("====================================");
        tracker.enter("plan-ambiguity-check");
        if (!request.identityAlreadyResolved && runtime.domain.executionStrategy.checkPlanAmbiguity) {
          const planAmbiguities = runtime.domain.executionStrategy.checkPlanAmbiguity(executionPlan);
          if (planAmbiguities && planAmbiguities.length > 0) {
            return {
              success: false,
              rows: [],
              rowCount: 0,
              error: buildClarificationMessage(planAmbiguities),
              answerability: {
                status: "ambiguous",
                reason: "identity-ambiguous",
                candidates: planAmbiguities.flatMap((ambiguity) => ambiguity.candidates ?? [])
              },
              // Tier0 Task 6 (F8 own-choice extension): same carry-forward as the
              // entity-identity-ambiguity gate above - this Turn's already-
              // resolved metric/concept candidates (e.g. "mortality-rate" +
              // "acute-myocardial-infarction" for "Mayo Clinic best AMI
              // mortality"), so a Layer 2 continuation's "own" choice can tell
              // whether a specific metric/condition was named at all.
              semanticMatches: semanticResult.matches
            };
          }
        }
        const completeness = assessPlanCompleteness(
          semanticResult.matches,
          executionPlan,
          plan.plan.semantic
        );
        console.log("========== PLAN COMPLETENESS ==========");
        console.log(JSON.stringify(completeness, null, 2));
        console.log("========================================");
        const hasUnaccountedMetricOrConceptLoss = completeness.discrepancies.some(
          (discrepancy) => discrepancy.semanticType === "metric" || discrepancy.semanticType === "concept"
        );
        if (hasUnaccountedMetricOrConceptLoss) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: "This question resolved a measurement that could not be carried through to planning, so I can't safely answer it.",
            completeness,
            answerability: {
              status: "not_directly_answerable",
              reason: "plan-incomplete"
            }
          };
        }
        const primaryMetric = plan.plan.semantic.metrics[0]?.canonicalKey;
        const templateId = runtime.domain.executionStrategy.selectTemplateFromPlan ? runtime.domain.executionStrategy.selectTemplateFromPlan(executionPlan) : runtime.domain.executionStrategy.selectTemplate(
          primaryMetric,
          plan.plan.intent
        );
        tracker.enter("capability-template-availability");
        const template = runtime.sqlResolver.resolve(
          templateId
        );
        console.log("========== RUNTIME ==========");
        console.log("Metrics:", plan.plan.semantic.metrics);
        console.log("Primary Metric:", primaryMetric);
        console.log("Requested Template:", templateId);
        if (template.template) {
          console.log("Resolved Template:", template.template.id);
          console.log(
            "Parameters:",
            template.template.parameters
          );
        }
        if (!template.found || !template.template) {
          const alternatives = discoverAlternatives(primaryMetric, executionPlan, runtime);
          const guidanceMessage = buildGuidanceMessage(
            {
              status: "not_directly_answerable",
              reason: "capability-unavailable",
              ...alternatives.length > 0 ? { alternatives } : {}
            },
            runtime.domain.metrics
          );
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: guidanceMessage ?? "SQL template not found.",
            answerability: {
              status: "not_directly_answerable",
              reason: "capability-unavailable",
              ...alternatives.length > 0 ? { alternatives } : {}
            }
          };
        }
        if (template.template.enabled === false) {
          const alternatives = discoverAlternatives(primaryMetric, executionPlan, runtime);
          const guidanceMessage = buildGuidanceMessage(
            {
              status: "not_directly_answerable",
              reason: "capability-unavailable",
              ...alternatives.length > 0 ? { alternatives } : {}
            },
            runtime.domain.metrics
          );
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: guidanceMessage ?? "This capability is not currently available.",
            answerability: {
              status: "not_directly_answerable",
              reason: "capability-unavailable",
              ...alternatives.length > 0 ? { alternatives } : {}
            }
          };
        }
        const parameters = runtime.domain.executionStrategy.resolveParametersFromPlan ? runtime.domain.executionStrategy.resolveParametersFromPlan(executionPlan) : runtime.domain.executionStrategy.resolveParameters(
          plan.plan.parameters
        );
        console.log("========== PARAMETERS ==========");
        console.log(parameters);
        console.log("================================");
        const templateParameters = template.template.parameters ?? [];
        tracker.enter("parameter-filter-compatibility");
        const hasIncompatibleFilter = executionPlan.filters.some(
          (filter) => !isFilterCompatibleWithTemplate(filter, parameters, templateParameters)
        );
        if (hasIncompatibleFilter) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: "This request's constraints cannot be safely represented by the available execution capability.",
            answerability: {
              status: "not_directly_answerable"
            }
          };
        }
        const missingRequiredParameter = templateParameters.some(
          (parameter) => parameter.required && (parameters[parameter.name] === void 0 || parameters[parameter.name] === null)
        );
        if (missingRequiredParameter) {
          return {
            success: false,
            rows: [],
            rowCount: 0,
            error: "I don't have enough specific information to identify exactly which record this question refers to. Please include more identifying detail (such as a full name or location) and try again.",
            answerability: {
              status: "not_directly_answerable"
            }
          };
        }
        tracker.enter("deterministic-warehouse-execution");
        if (request.dryRun) {
          return {
            success: true,
            rows: [],
            rowCount: 1,
            answerability: { status: "answerable" }
          };
        }
        const primaryResult = await executor.execute(
          template.template,
          parameters
        );
        if (!primaryResult.success) {
          return {
            ...primaryResult,
            answerability: { status: "not_directly_answerable" }
          };
        }
        if (primaryResult.rowCount === 0 && executionPlan.operation === "lookup") {
          const resolvedEntityCandidates = semanticResult.matches.filter(
            (candidate) => candidate.semanticType === "entity"
          );
          if (resolvedEntityCandidates.length === 1 && template.template.singleEntityRecord === true) {
            return {
              ...primaryResult,
              success: false,
              error: "No data is available for the requested entity and metric.",
              answerability: {
                status: "not_directly_answerable",
                reason: "data-unavailable"
              }
            };
          }
        }
        const coverageFacts = [];
        async function collectCoverageFact(metric, coverageTemplateId) {
          if (!coverageTemplateId) {
            return;
          }
          const coverageTemplate = runtime.sqlResolver.resolve(coverageTemplateId);
          if (!coverageTemplate.found || !coverageTemplate.template) {
            console.log(
              `========== PHASE 8.6C: coverage template "${coverageTemplateId}" not found - omitting coverage for "${metric}" ==========`
            );
            return;
          }
          try {
            const coverageResult = await executor.execute(coverageTemplate.template, parameters);
            if (!coverageResult.success) {
              console.log(
                `========== PHASE 8.6C: coverage query for "${metric}" failed - omitting coverage: ${coverageResult.error ?? "unknown error"} ==========`
              );
              return;
            }
            const coverageRow = coverageResult.rows[0];
            const eligibleCount = Number(coverageRow?.eligible_count);
            const coveredCount = Number(coverageRow?.covered_count);
            if (!Number.isFinite(eligibleCount) || !Number.isFinite(coveredCount)) {
              console.log(
                `========== PHASE 8.6C: coverage query for "${metric}" returned an unexpected shape - omitting coverage ==========`
              );
              return;
            }
            coverageFacts.push({ metric, eligibleCount, coveredCount });
          } catch (error) {
            console.log(
              `========== PHASE 8.6C: coverage query for "${metric}" threw - omitting coverage: ${error instanceof Error ? error.message : String(error)} ==========`
            );
          }
        }
        if (executionPlan.operation === "rank" || executionPlan.operation === "aggregate") {
          await collectCoverageFact(executionPlan.metric, template.template.coverageTemplateId);
        }
        const strategy = runtime.domain.executionStrategy;
        const identityField = strategy.resultIdentityField;
        if (executionPlan.metrics && executionPlan.metrics.length > 1 && identityField && strategy.selectSecondaryMetricTemplate && strategy.resolveSecondaryMetricParameters) {
          const primaryRows = primaryResult.rows;
          const identityValues = primaryRows.map((row) => row[identityField]).filter((value) => value !== void 0 && value !== null);
          const secondaryMetrics = executionPlan.metrics.filter(
            (metric) => metric.metric !== executionPlan.metric
          );
          console.log("========== PHASE 7: SECONDARY METRICS ==========");
          console.log("Identity field:", identityField);
          console.log("Identity values:", identityValues);
          console.log("Secondary metrics:", secondaryMetrics);
          console.log("==================================================");
          for (const secondaryMetric of secondaryMetrics) {
            const secondaryTemplateId = strategy.selectSecondaryMetricTemplate(
              secondaryMetric,
              executionPlan
            );
            const secondaryTemplate = runtime.sqlResolver.resolve(secondaryTemplateId);
            if (!secondaryTemplate.found || !secondaryTemplate.template) {
              const alternatives = discoverAlternatives(secondaryMetric.metric, executionPlan, runtime);
              const guidanceMessage = buildGuidanceMessage(
                {
                  status: "not_directly_answerable",
                  reason: "capability-unavailable",
                  ...alternatives.length > 0 ? { alternatives } : {}
                },
                runtime.domain.metrics
              );
              return {
                success: false,
                rows: [],
                rowCount: 0,
                error: guidanceMessage ?? `SQL template not found for requested metric "${secondaryMetric.metric}".`,
                answerability: {
                  status: "not_directly_answerable",
                  reason: "capability-unavailable",
                  ...alternatives.length > 0 ? { alternatives } : {}
                }
              };
            }
            if (executionPlan.operation === "rank" || executionPlan.operation === "aggregate") {
              await collectCoverageFact(secondaryMetric.metric, secondaryTemplate.template.coverageTemplateId);
            }
            const secondaryParameters = strategy.resolveSecondaryMetricParameters(
              secondaryMetric,
              executionPlan,
              identityValues
            );
            const secondaryResult = await executor.execute(
              secondaryTemplate.template,
              secondaryParameters
            );
            if (!secondaryResult.success) {
              return {
                success: false,
                rows: [],
                rowCount: 0,
                error: "I couldn't retrieve one of the requested measures right now. Please try again or ask about a single measure.",
                answerability: { status: "not_directly_answerable" }
              };
            }
            const secondaryRows = secondaryResult.rows;
            const secondaryIndex = /* @__PURE__ */ new Map();
            for (const row of secondaryRows) {
              secondaryIndex.set(row[identityField], row);
            }
            for (const row of primaryRows) {
              const match = secondaryIndex.get(row[identityField]);
              if (match) {
                for (const [key, value] of Object.entries(match)) {
                  if (key !== identityField) {
                    row[key] = value;
                  }
                }
              }
            }
          }
        }
        return {
          ...primaryResult,
          completeness,
          answerability: { status: "answerable" },
          ...coverageFacts.length > 0 ? { coverage: coverageFacts } : {},
          executedParameters: parameters
        };
      };
      let preNormalizeAttempted = false;
      let pendingClarification;
      let declinedTerms;
      if (llmFallback && !request.llmFallbackAttempted && !request.dryRun && !request.identityAlreadyResolved && !request.forcedIdentityCandidate && !request.forcedIntent && !request.companionEntities && isLlmFirstFrontDoorEnabled()) {
        const resolved = semantic.resolve(request.question);
        const hasUniqueRecordMatch = resolved.matches.some(
          (candidate) => candidate.semanticType === "entity" && candidate.definition.identifiesUniqueRecord === true
        );
        const fullyUnderstood = planner.isFullyUnderstood(resolved.normalizedQuery, resolved.matches, runtime.domain.entities);
        if (!hasUniqueRecordMatch && !fullyUnderstood) {
          preNormalizeAttempted = true;
          tracker.enter("llm-normalization");
          const rewrite = await llmFallback(request.question);
          const rewriteMeta = rewrite?.meta;
          if (rewrite && "canonicalQuestion" in rewrite && rewrite.canonicalQuestion !== request.question) {
            tracker.exit("llm-normalization", "rewritten", 0, void 0, {
              ...rewriteMeta,
              canonicalQuestion: rewrite.canonicalQuestion.slice(0, 300)
            });
            const recursiveResult = await engine.execute({
              ...request,
              question: rewrite.canonicalQuestion,
              llmFallbackAttempted: true,
              rewrittenFrom: request.question
            });
            return {
              ...recursiveResult,
              trace: [...tracker.gates, ...recursiveResult.trace ?? []]
            };
          }
          if (rewrite && "clarification" in rewrite) {
            pendingClarification = rewrite.clarification;
            tracker.exit("llm-normalization", "clarification", 0, void 0, rewriteMeta);
          } else if (rewrite && "canonicalQuestion" in rewrite) {
            tracker.exit("llm-normalization", "unchanged", 0, void 0, rewriteMeta);
          } else if (rewrite && "unsupportedTerms" in rewrite) {
            declinedTerms = rewrite.unsupportedTerms;
            tracker.exit("llm-normalization", "unsupported", 0, void 0, {
              ...rewriteMeta,
              unsupportedTerms: rewrite.unsupportedTerms.join("; ").slice(0, 300)
            });
          } else {
            tracker.exit("llm-normalization", "unavailable", 0, void 0, rewriteMeta);
          }
          if (!declinedTerms) {
            const rewriteWords = new Set(
              (runtime.domain.lexicalRewrites ?? []).flatMap((rule) => rule.pattern.toLowerCase().split(/\s+/))
            );
            frontDoorUnaccounted = planner.findUnaccountedWords(resolved.normalizedQuery, resolved.matches, runtime.domain.entities).filter((word) => !rewriteWords.has(word));
          }
        }
      }
      let result = declinedTerms ? {
        success: false,
        rows: [],
        rowCount: 0,
        error: "Unable to resolve question.",
        answerability: { status: "not_directly_answerable", reason: "semantic-incomplete" }
      } : await runPipeline();
      if (preNormalizeAttempted && pendingClarification && !result.success && result.answerability?.status !== "ambiguous") {
        result = { ...result, error: pendingClarification };
      } else if (!result.success && result.answerability?.status !== "ambiguous" && llmFallback && !request.llmFallbackAttempted && !preNormalizeAttempted && !request.dryRun) {
        const rewrite = await llmFallback(request.question);
        if (rewrite && "canonicalQuestion" in rewrite && rewrite.canonicalQuestion !== request.question) {
          tracker.enter("llm-normalization");
          tracker.exit("llm-normalization", "rewritten", 0, void 0, {
            ...rewrite.meta,
            canonicalQuestion: rewrite.canonicalQuestion.slice(0, 300)
          });
          const recursiveResult = await engine.execute({
            ...request,
            question: rewrite.canonicalQuestion,
            llmFallbackAttempted: true,
            rewrittenFrom: request.question
          });
          return {
            ...recursiveResult,
            trace: [...tracker.gates, ...recursiveResult.trace ?? []]
          };
        }
        if (rewrite) {
          tracker.enter("llm-normalization");
          tracker.exit(
            "llm-normalization",
            "clarification" in rewrite ? "clarification" : "unsupportedTerms" in rewrite ? "unsupported" : "unavailable",
            0,
            void 0,
            {
              ...rewrite.meta,
              ..."unsupportedTerms" in rewrite ? { unsupportedTerms: rewrite.unsupportedTerms.join("; ").slice(0, 300) } : {}
            }
          );
        }
        if (rewrite && "clarification" in rewrite) {
          result = { ...result, error: rewrite.clarification };
        }
      }
      tracker.exit(
        "response",
        result.success ? "ok" : "refused",
        result.rowCount ?? 0,
        result.answerability?.status
      );
      const finalResult = { ...result, trace: tracker.gates };
      request.onResult?.(finalResult);
      if (!request.includeSuggestions || !runtime.domain.executionStrategy.generateSuggestions) {
        return finalResult;
      }
      const suggestionContext = {
        question: request.question,
        success: finalResult.success,
        rowCount: finalResult.rowCount,
        rows: finalResult.rows,
        ...capturedExecutionPlan ? { executionPlan: capturedExecutionPlan } : {},
        ...finalResult.answerability ? { answerability: finalResult.answerability } : {}
      };
      const candidateQuestions = await runtime.domain.executionStrategy.generateSuggestions(
        suggestionContext
      );
      const isIdentityAmbiguous = finalResult.answerability?.status === "ambiguous" && finalResult.answerability?.reason === "identity-ambiguous";
      if (isIdentityAmbiguous) {
        return { ...finalResult, suggestions: candidateQuestions.slice(0, 3) };
      }
      const suggestions = [];
      for (const candidate of candidateQuestions) {
        if (suggestions.length >= 3) {
          break;
        }
        if (suggestions.includes(candidate) || candidate === request.question) {
          continue;
        }
        const trial = await engine.execute({
          question: candidate,
          dryRun: true
        });
        if (trial.success) {
          suggestions.push(candidate);
        }
      }
      return { ...finalResult, suggestions };
    }
  };
  return engine;
}

// src/continuation/create-pending-interaction.ts
async function createPendingInteraction(supabase, params) {
  const { data, error } = await supabase.from("pending_interactions").insert({
    kind: params.kind,
    user_id: params.userId || null,
    original_question: params.originalQuestion,
    original_semantic_result: params.originalSemanticResult,
    pending_target: params.pendingTarget,
    offered_options: params.offeredOptions
    // expires_at has DEFAULT (NOW() + INTERVAL '5 minutes')
    // consumed has DEFAULT FALSE
    // created_at has DEFAULT NOW()
  }).select().single();
  if (error) {
    throw new Error(`Failed to create pending interaction: ${error.message}`);
  }
  if (!data) {
    throw new Error("Failed to create pending interaction: no data returned");
  }
  return {
    id: data.id,
    kind: data.kind,
    userId: data.user_id || void 0,
    originalQuestion: data.original_question,
    originalSemanticResult: data.original_semantic_result,
    pendingTarget: data.pending_target,
    offeredOptions: data.offered_options,
    expiresAt: data.expires_at,
    consumed: data.consumed,
    createdAt: data.created_at
  };
}

// src/continuation/retrieve-pending-interaction.ts
async function retrievePendingInteraction(supabase, pendingInteractionId, requestUserId) {
  const { data, error } = await supabase.from("pending_interactions").select("*").eq("id", pendingInteractionId).eq("consumed", false).gt("expires_at", (/* @__PURE__ */ new Date()).toISOString()).single();
  if (error || !data) {
    throw new Error("Interaction not found, already used, or expired");
  }
  if (data.user_id && data.user_id !== requestUserId) {
    throw new Error("Unauthorized: interaction belongs to another user");
  }
  return {
    id: data.id,
    kind: data.kind,
    userId: data.user_id || void 0,
    originalQuestion: data.original_question,
    originalSemanticResult: data.original_semantic_result,
    pendingTarget: data.pending_target,
    offeredOptions: data.offered_options,
    expiresAt: data.expires_at,
    consumed: data.consumed,
    createdAt: data.created_at
  };
}

// src/continuation/consume-pending-interaction.ts
async function consumePendingInteraction(supabase, pendingInteractionId) {
  const { error, count } = await supabase.from("pending_interactions").update({ consumed: true }).eq("id", pendingInteractionId).eq("consumed", false);
  if (error) {
    throw new Error(`Failed to consume interaction: ${error.message}`);
  }
  if (count === 0) {
    throw new Error("Interaction already consumed");
  }
}

// src/continuation/match-clarification.ts
function matchClarificationResponse(userResponse, options) {
  if (!userResponse || options.length === 0) {
    return null;
  }
  const normalized = userResponse.toLowerCase().trim();
  for (const option of options) {
    for (const [key, value] of Object.entries(option)) {
      if (typeof value === "string" && value.toLowerCase() === normalized) {
        return option;
      }
    }
  }
  const cityMatches = options.filter(
    (o) => o.city && typeof o.city === "string" && o.city.toLowerCase() === normalized
  );
  if (cityMatches.length === 1) return cityMatches[0] || null;
  const stateMatches = options.filter(
    (o) => o.state && typeof o.state === "string" && o.state.toLowerCase() === normalized
  );
  if (stateMatches.length === 1) return stateMatches[0] || null;
  const [cityPart, statePart, ...extraParts] = normalized.split(",").map((part) => part.trim());
  if (cityPart && statePart && extraParts.length === 0) {
    const cityStateMatches = options.filter(
      (o) => typeof o.city === "string" && typeof o.state === "string" && o.city.toLowerCase() === cityPart && o.state.toLowerCase() === statePart
    );
    if (cityStateMatches.length === 1) return cityStateMatches[0] || null;
  }
  const labelMatches = options.filter((o) => {
    const label = typeof o.displayLabel === "string" ? o.displayLabel.toLowerCase() : "";
    return label.includes(normalized) || normalized.includes(label);
  });
  if (labelMatches.length === 1) return labelMatches[0] || null;
  return null;
}
function matchClarificationPair(userResponse, options) {
  const sides = (userResponse ?? "").split(/\s+(?:and|&)\s+/i);
  if (sides.length !== 2) return null;
  const first = matchClarificationResponse(sides[0], options);
  const second = matchClarificationResponse(sides[1], options);
  return first && second && first !== second ? [first, second] : null;
}

// src/continuation/match-guidance.ts
function matchGuidanceResponse(userResponse, options) {
  if (!userResponse || options.length === 0) {
    return null;
  }
  let normalized = userResponse.toLowerCase().trim();
  normalized = normalized.replace(/^(use|try|show|with)\s+/i, "");
  const exactId = options.find((o) => o.capabilityId === normalized);
  if (exactId) return exactId;
  const exactName = options.find(
    (o) => o.displayName.toLowerCase() === normalized
  );
  if (exactName) return exactName;
  const partialMatches = options.filter((o) => {
    const displayName = o.displayName.toLowerCase();
    return displayName.includes(normalized) || normalized.includes(displayName);
  });
  if (partialMatches.length === 1) return partialMatches[0] || null;
  return null;
}

// src/continuation/reconstruct-clarification.ts
function reconstructClarificationRequest(interaction, selectedOption) {
  const target = interaction.pendingTarget;
  return {
    question: interaction.originalQuestion,
    forcedIdentity: selectedOption,
    // Domain-specific candidate
    originalSemanticResult: interaction.originalSemanticResult
  };
}

// src/continuation/reconstruct-guidance.ts
function reconstructGuidanceRequest(interaction, selectedOption) {
  const target = interaction.pendingTarget;
  const originalQuestion = interaction.originalQuestion;
  const reconstructedQuestion = originalQuestion;
  return {
    question: reconstructedQuestion,
    selectedCapability: selectedOption.capabilityId,
    originalSemanticResult: interaction.originalSemanticResult
  };
}

// src/continuation/reconstruct-hospital-choice.ts
function reconstructHospitalChoice(selectedOption) {
  const choice = selectedOption.facility_id;
  if (!choice || typeof choice !== "object" || !choice.choice || !choice.hospitalName) {
    return null;
  }
  if (choice.choice === "similar") {
    return {
      kind: "guidance",
      message: `We don't have similarity ranking yet. You can compare ${choice.hospitalName} with another hospital explicitly (e.g. "Compare ${choice.hospitalName} and Cleveland Clinic"), or ask for the highest-rated hospitals in a specific state.`
    };
  }
  if (choice.choice === "lookup" && choice.facilityId) {
    return {
      kind: "lookup",
      facilityId: choice.facilityId,
      hospitalName: choice.hospitalName
    };
  }
  return null;
}
export {
  buildClarificationMessage,
  buildGuidanceMessage,
  consumePendingInteraction,
  createPendingInteraction,
  createRuntimeEngine,
  matchClarificationPair,
  matchClarificationResponse,
  matchGuidanceResponse,
  reconstructClarificationRequest,
  reconstructGuidanceRequest,
  reconstructHospitalChoice,
  retrievePendingInteraction
};
