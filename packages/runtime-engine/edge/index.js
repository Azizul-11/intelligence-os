// src/create-runtime-engine.ts
import { assessPlanCompleteness, hasRelationshipWithoutBenchmark } from "@intelligence/query-planner";

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

// src/create-runtime-engine.ts
function valuesMatch(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
  return a === b;
}
function isFilterCompatibleWithTemplate(filter, resolvedParameters, templateParameters) {
  const matchingParameter = templateParameters.find(
    (parameter) => valuesMatch(resolvedParameters[parameter.name], filter.value)
  );
  if (!matchingParameter) {
    return false;
  }
  return !(filter.operator === "in" && matchingParameter.type !== "array");
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
function createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper,
  executor
}) {
  return {
    async execute(request) {
      console.log(">>> RuntimeEngine.execute()");
      const semanticResult = semantic.resolve(request.question);
      console.log("========== SEMANTIC RESULT ==========");
      console.log(
        JSON.stringify(semanticResult, null, 2)
      );
      console.log("=====================================");
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
          }
        };
      }
      if (!semanticResult.resolved) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: "Unable to resolve question.",
          answerability: { status: "not_directly_answerable" }
        };
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
      const plan = planner.createPlan(semanticResult, runtime.domain.metrics);
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
      const executionPlan = executionPlanMapper.map(plan.plan);
      console.log("========== EXECUTION PLAN ==========");
      console.log(JSON.stringify(executionPlan, null, 2));
      console.log("====================================");
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
      const hasIncompatibleFilter = (executionPlan.operation === "rank" || executionPlan.operation === "aggregate") && executionPlan.filters.some(
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
              error: `Failed to execute requested metric "${secondaryMetric.metric}": ${secondaryResult.error ?? "unknown error"}`,
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
        ...coverageFacts.length > 0 ? { coverage: coverageFacts } : {}
      };
    }
  };
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
  const labelMatches = options.filter((o) => {
    const label = typeof o.displayLabel === "string" ? o.displayLabel.toLowerCase() : "";
    return label.includes(normalized) || normalized.includes(label);
  });
  if (labelMatches.length === 1) return labelMatches[0] || null;
  return null;
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
export {
  buildClarificationMessage,
  buildGuidanceMessage,
  consumePendingInteraction,
  createPendingInteraction,
  createRuntimeEngine,
  matchClarificationResponse,
  matchGuidanceResponse,
  reconstructClarificationRequest,
  reconstructGuidanceRequest,
  retrievePendingInteraction
};
