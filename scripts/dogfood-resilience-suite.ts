/**
 * Automated dogfooding harness for
 * docs/Post LLM DogFodding/INTELLIGENCEOS_FRONTEND_LLM_RESILIENCE_TEST_SUITE.md.
 *
 * Runs every single-turn query (sections A-N) through the SAME wiring
 * production uses (isConversational -> handleConversational, or the
 * real engine with the capability-aware llmFallback hook), and writes
 * one JSON line per query to stdout: {section, id, query, cardType,
 * success, rowCount, error, answerabilityStatus, answerabilityReason,
 * topRows (first 3 rows, raw), suggestions}.
 *
 * Section L (continuation, 5 two-turn cases) is handled separately by
 * scripts/dogfood-continuation-cases.ts (needs the real HTTP
 * pendingInteractionId flow against the deployed function).
 *
 * Run: npx tsx scripts/dogfood-resilience-suite.ts > /tmp/dogfood-raw.jsonl
 */
import "dotenv/config";

import { healthcareDomain, DOMAIN_CAPABILITIES } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import { SqlExecutor } from "../packages/sql-executor/src/sql-executor";
import { SupabaseDatabaseAdapter } from "../packages/sql-executor/src/supabase-database-adapter";
import { createClient } from "@supabase/supabase-js";
import { llmGateway } from "../packages/llm-model-gateway/src/llm-model-gateway";
import { env } from "./shared/env";

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);
const planner = new QueryPlanner();
const mapper = new ExecutionPlanMapper();
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);
const adapter = new SupabaseDatabaseAdapter(client);
const executor = new SqlExecutor(adapter);

const engine = createRuntimeEngine({
  runtime,
  semantic,
  planner,
  executionPlanMapper: mapper,
  executor,
  llmFallback: async (question: string) => {
    const result = await llmGateway.normalizeMessyLanguage(question, DOMAIN_CAPABILITIES);
    if (result.status === "ok" && result.canonical_question) {
      return { canonicalQuestion: result.canonical_question };
    }
    if (result.status === "need_clarification" && result.reason) {
      return { clarification: result.reason };
    }
    return null;
  },
});

// Mirrors chat.ts's own isConversational() classifier exactly.
const CONVERSATIONAL_PATTERNS: RegExp[] = [
  /^(hi|hello|hey|hiya|howdy|greetings|yo)\b/i,
  /^(what can you do|what do you do|capabilities|help|what is this|who are you|what are you)\b/i,
  /^(thanks|thank you|bye|goodbye)\b/i,
  /^(how (are|do) you work|explain (yourself|what you can do))\b/i,
];
function isConversational(question: string): boolean {
  const trimmed = question.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  return CONVERSATIONAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

interface QueryCase {
  section: string;
  id: string;
  query: string;
}

const CASES: QueryCase[] = [];
function add(section: string, ids: number[], queries: string[]) {
  ids.forEach((id, i) => CASES.push({ section, id: `${section}${id}`, query: queries[i]! }));
}

// A. Conversational 1-20
add(
  "A",
  Array.from({ length: 20 }, (_, i) => i + 1),
  [
    "hi", "hello there", "hey", "hey man", "good morning", "good evening",
    "what can you do?", "what can I ask you?", "what kind of hospital questions can you answer?",
    "how does this thing work?", "how do you work?", "can you help me explore hospitals?",
    "thanks", "thank you", "appreciate it", "bye", "see ya",
    "what are you useful for?", "tell me what I can search for", "give me some examples",
  ],
);

// B. Typos 21-45
add(
  "B",
  Array.from({ length: 25 }, (_, i) => i + 21),
  [
    "hospitals with best safty performence", "show me hosptials mortality", "best hspitals in texas",
    "best hopitals in california", "highest ratng hospitals", "show 5 star hospitls",
    "show 5 star hospitals in texas", "hospitls with low mortality", "hospitals wit best mortality",
    "best saftey hospitals", "top saftey performers in texas", "best patient experiance hospitals",
    "best patient experiance in texas", "hosptials with good ratings in texas", "top rated hospitl in california",
    "low readmision hospitals", "lowest readmisions in texas", "heart failure readmision hospitals",
    "heart atack mortality hospitals", "cabg readmision best hospitals", "copd mortaliy hospitals",
    "pneumonia mortaliy hospitals", "hip knee readmision hospitals", "tell me hospitals with saftey score",
    "show hospitls with best ratings texas",
  ],
);

// C. Messy natural language 46-70
add(
  "C",
  Array.from({ length: 25 }, (_, i) => i + 46),
  [
    "I want to see the hospitals doing best overall", "Which hospitals are basically the top of the list?",
    "Show me the really highly rated hospitals", "Which hospitals look safest?",
    "Where are the hospitals doing best on safety?", "I care about mortality — which hospitals perform best?",
    "Which places have the strongest patient experience?", "I want hospitals patients seem happiest with",
    "Which hospitals have the fewest readmission problems?", "Find me hospitals that do well after treatment",
    "I need the top hospitals in Texas", "Give me the strongest hospitals in California",
    "I'm looking for highly rated hospitals in Florida", "Show hospitals in Texas that perform well overall",
    "Which hospitals in Texas are the cream of the crop?", "I'm interested in the safest hospitals in California",
    "Where are the better mortality outcomes in Texas?", "Which hospitals have better outcomes for heart attacks?",
    "I want good CABG readmission performance", "Find strong hospitals for COPD mortality",
    "Which hospitals look good for heart failure outcomes?", "How are hospitals doing with pneumonia deaths?",
    "What about hip and knee readmissions?", "Show me places patients rate highly",
    "Which hospitals are highly regarded by their patients?",
  ],
);

// D. Rating/ranking diversity 71-90
add(
  "D",
  Array.from({ length: 20 }, (_, i) => i + 71),
  [
    "highest rated hospitals", "best rated hospitals", "top rated hospitals", "hospitals with the best ratings",
    "hospitals that got the highest rating", "five star hospitals", "five-star hospitals",
    "hospitals rated 5 stars", "show hospitals with a rating of 5", "which hospitals have perfect ratings?",
    "best hospitals in Texas", "top hospitals in Texas", "highest-rated hospitals in Texas",
    "give me Texas's best hospitals", "which Texas hospitals rank highest?",
    "best hospitals in California and Texas", "top hospitals across California and Texas",
    "compare the best hospitals in Texas with California", "Texas versus California — show me the top hospitals",
    "which state has better-rated hospitals, Texas or California?",
  ],
);

// E. Safety Performance 91-105
add(
  "E",
  Array.from({ length: 15 }, (_, i) => i + 91),
  [
    "hospitals with best safety performance", "safest hospitals", "hospitals with the strongest safety results",
    "which hospitals perform best on safety?", "where are the safest hospitals?",
    "show me hospitals with better safety outcomes", "I want the best safety performers",
    "hospitals doing well on patient safety", "which hospitals have excellent safety performance?",
    "show the top hospitals for safety", "safest hospitals in Texas", "safest hospitals in California",
    "top safety hospitals in Florida", "which Texas hospitals are safest?",
    "give me California hospitals with the strongest safety results",
  ],
);

// F. Mortality/outcome 106-125
add(
  "F",
  Array.from({ length: 20 }, (_, i) => i + 106),
  [
    "hospitals with best mortality", "hospitals with lowest mortality", "which hospitals have better mortality outcomes?",
    "where is mortality performance strongest?", "hospitals doing best on mortality",
    "show hospitals with strong mortality results", "which hospitals perform well on deaths?",
    "hospitals with fewer deaths", "lowest mortality hospitals in Texas", "best mortality hospitals in California",
    "Texas hospitals with better mortality performance", "which California hospitals have strong mortality outcomes?",
    "show me hospitals performing above national mortality average", "California hospitals performing above national mortality average",
    "hospitals in California above the national mortality average", "show hospitals above the national average for mortality in California",
    "which hospitals are outperforming the national mortality benchmark?", "I only care about mortality, give me the leaders",
    "rank hospitals by mortality performance", "who's doing best on mortality outcomes?",
  ],
);

// G. Condition-specific 126-150
add(
  "G",
  Array.from({ length: 25 }, (_, i) => i + 126),
  [
    "hospitals doing best with heart attacks", "which hospitals have better heart attack survival?",
    "show me heart attack mortality performance", "best hospitals for heart attack outcomes",
    "hospitals with strong AMI mortality results", "which hospitals handle bypass surgery readmissions best?",
    "best CABG readmission performance", "hospitals with lower bypass readmissions",
    "which hospitals have the best CABG results?", "show hospitals with good coronary bypass readmission outcomes",
    "which hospitals perform best for COPD mortality?", "hospitals with strong COPD outcomes",
    "best hospitals for COPD death rates", "show low COPD mortality hospitals", "where is COPD mortality performance best?",
    "hospitals doing best with heart failure mortality", "which hospitals have lower heart failure death rates?",
    "best heart failure mortality hospitals", "show hospitals performing well on heart failure",
    "which hospitals have the best pneumonia mortality?", "hospitals with lower pneumonia death rates",
    "best pneumonia outcome hospitals", "show strong pneumonia mortality performance",
    "hospitals with good hip and knee readmission performance", "which hospitals have lower hip-knee readmissions?",
  ],
);

// H. Patient experience 151-165
add(
  "H",
  Array.from({ length: 15 }, (_, i) => i + 151),
  [
    "hospitals with best patient experience", "which hospitals have the happiest patients?",
    "hospitals patients rate highly", "best patient satisfaction hospitals", "where do patients report the best experience?",
    "show top hospitals for patient experience", "which hospitals get the strongest patient feedback?",
    "hospitals with great patient satisfaction", "top patient-rated hospitals in Texas",
    "best patient experience in California", "which Texas hospitals score well with patients?",
    "show me highly rated patient experience hospitals", "which hospitals have five-star patient experience?",
    "hospitals with strong patient survey results", "tell me about Mayo Clinic and its patient experience",
  ],
);

// I. Ownership 166-180
add(
  "I",
  Array.from({ length: 15 }, (_, i) => i + 166),
  [
    "best non-profit hospitals", "highest-rated nonprofit hospitals", "show non-profit hospitals with the best ratings",
    "non-profit hospitals in Texas with the best overall rating", "top private nonprofit hospitals in Texas",
    "best government hospitals", "highest-rated government hospitals", "show government hospitals in Texas",
    "top proprietary hospitals", "best physician-owned hospitals", "show voluntary non-profit hospitals in Texas",
    "best non-profit hospitals with low mortality", "non-profit hospitals with the lowest mortality",
    "five-star nonprofit hospitals in Texas", "show me the best-rated nonprofit hospitals, not government ones",
  ],
);

// J. Geography 181-200
add(
  "J",
  Array.from({ length: 20 }, (_, i) => i + 181),
  [
    "hospitals in Texas", "hospitals in California", "hospitals in Florida",
    "how many hospitals are in Texas?", "how many hospitals are in California?", "how many hospitals are in Florida?",
    "all hospitals in Denver, Colorado with their ratings", "hospitals around Denver Colorado and their ratings",
    "best hospitals near Denver", "hospitals in Birmingham Alabama", "top hospitals in Birmingham Alabama",
    "show all Birmingham Alabama hospitals", "hospitals in Albany county", "best hospitals in Albany county",
    "Albany County hospitals in New York", "Albany County hospitals in Wyoming", "best hospitals in Albany New York",
    "best hospitals in Albany Wyoming", "hospitals in Texas and California", "best hospitals across Texas and California",
  ],
);

// K. Entity resolution 201-215
add(
  "K",
  Array.from({ length: 15 }, (_, i) => i + 201),
  [
    "tell me about Mayo Clinic", "give me the complete profile of Mayo Clinic", "what can you tell me about Mayo Clinic?",
    "Mayo Clinic overall rating", "Mayo Clinic Rochester Minnesota overall rating",
    "Mayo Clinic in Rochester Minnesota overall rating", "Mayo Clinic Hospital Rochester Minnesota overall rating",
    "Mayo Clinic in Jacksonville Florida overall rating", "compare Mayo Clinic Jacksonville with Mayo Clinic Rochester",
    "Cleveland Clinic overall rating", "Cleveland Clinic Avon Ohio overall rating",
    "Cleveland Clinic Weston Florida overall rating", "tell me about NYU LANGONE HOSPITALS",
    "give me the complete profile of NYU LANGONE HOSPITALS", "what is the rating for Northwest Medical Center?",
  ],
);

// M. Adversarial A1-A20
add(
  "M",
  Array.from({ length: 20 }, (_, i) => i + 1),
  [
    "what's the weather in Texas?", "who is the president?", "write me a poem about Mayo Clinic",
    "what is the stock price of Mayo Clinic?", "which hospital has the shortest wait time?",
    "which hospital has the cheapest surgery?", "which hospitals have the best doctors?",
    "which hospital has the best surgeon?", "which hospital has the best ICU?", "which hospital treats cancer the best?",
    "best sepsis hospitals", "postoperative sepsis rates", "stroke mortality hospitals", "diabetes hospitals",
    "heart disease hospitals", "best oncology hospitals", "hospitals with shortest emergency room wait",
    "hospitals with highest nurse staffing", "hospitals with best infection control",
    "hospitals with the highest patient safety score AND lowest length of stay",
  ],
);

// N. Reasoning probes 1-15
add(
  "N",
  Array.from({ length: 15 }, (_, i) => i + 1),
  [
    "I'm trying to find a really good hospital in Texas.",
    "I care more about safety than ratings — show me the leaders.",
    "I don't care about the biggest hospitals, just the ones patients rate highly.",
    "Show me the places where patients seem happiest.",
    "I want to avoid hospitals with poor mortality performance.",
    "I'm looking for somewhere that does well with heart attacks.",
    "Which Texas hospitals look strongest overall?",
    "Give me the California hospitals that stand out on mortality.",
    "I want five-star hospitals, but only nonprofit ones in Texas.",
    "Compare the strongest hospitals in Texas and California.",
    "Show me good hospitals, but focus on safety instead of their overall rating.",
    "I'm mainly interested in heart failure outcomes.",
    "Which places have the best experience from a patient's point of view?",
    "Find hospitals where the numbers look good for bypass patients.",
    "I want a hospital profile, not just a ranking — start with Mayo Clinic.",
  ],
);

function keyMetricValue(row: Record<string, unknown>): { column: string; value: unknown } | null {
  for (const col of ["score", "excess_readmission_ratio", "overall_rating", "safety_score", "mort_measures_better"]) {
    if (col in row) return { column: col, value: row[col] };
  }
  return null;
}

async function main() {
  for (const c of CASES) {
    if (c.section === "A") {
      const conv = isConversational(c.query);
      let record: Record<string, unknown> = {
        section: c.section,
        id: c.id,
        query: c.query,
        cardType: conv ? "conversational" : "unknown",
        classifiedConversational: conv,
      };
      if (conv) {
        try {
          const result = await llmGateway.handleConversational(c.query, DOMAIN_CAPABILITIES);
          record.answer = result.answer;
          record.suggestions = result.suggestions;
        } catch (error) {
          record.error = String(error);
        }
      }
      console.log(JSON.stringify(record));
      continue;
    }

    try {
      const result = await engine.execute({ question: c.query });
      const rows = (result.rows ?? []) as Record<string, unknown>[];
      const record = {
        section: c.section,
        id: c.id,
        query: c.query,
        cardType: result.success ? "success" : result.answerability?.status === "ambiguous" ? "clarification" : "failure",
        success: result.success,
        rowCount: result.rowCount,
        error: result.error,
        answerabilityStatus: result.answerability?.status,
        answerabilityReason: result.answerability?.reason,
        topRows: rows.slice(0, 3).map((r) => ({ hospital_name: r.hospital_name, state: r.state, ownership: r.ownership, ...keyMetricValue(r) })),
        suggestions: result.suggestions,
      };
      console.log(JSON.stringify(record));
    } catch (error) {
      console.log(JSON.stringify({ section: c.section, id: c.id, query: c.query, cardType: "FATAL", error: String(error) }));
    }
  }
}

main().catch((error) => {
  console.error("FATAL:", error);
  process.exit(1);
});
