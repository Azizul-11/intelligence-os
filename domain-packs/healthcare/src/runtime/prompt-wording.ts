/**
 * Batch 5A-2: the domain's own words for the prompts the LLM gateway assembles. The gateway (packages/llm-model-gateway) owns
 * the structure and the output contract and names no domain, entity or example; every sentence about hospitals, ownership,
 * states, conditions or this platform lives here and is only quoted back. Moved verbatim from the gateway, so the prompts a
 * healthcare question sees are unchanged by the move (checked byte for byte when it was made).
 *
 * The plain-wording rule (RULE 4) and its examples are generated from the layperson vocabulary (lay-vocabulary.ts), so the
 * model and the deterministic mapper read a phrase the same way.
 */
import type { PromptWording } from "@intelligence/llm-model-gateway";

import { LAY_PROMPT_EXAMPLES, LAY_PROMPT_RULES } from "./lay-vocabulary";
import { hcahpsDimensionConcepts } from "../concepts/hcahps-dimensions";

/** Batch 5B-3: the patient-survey dimensions, named once (not under CONDITIONS - see capability-catalog.ts). */
const SURVEY_TOPICS = hcahpsDimensionConcepts.map((concept) => concept.displayName).join(", ");

export const HEALTHCARE_PROMPT_WORDING: PromptWording = {
  normalizer: {
    subject: "US hospital analytics",
    rules: [
      "RULE 1 - SLOT PRESERVATION (highest priority, beats every other rule):",
      "Never ADD a state, city, county, ownership type, metric or condition that is not in the original question in some form (correct, misspelled or abbreviated). Never DROP or BROADEN one that is: a named city stays a city (\"in Houston\" is never widened to the state or the nation), an ownership word stays (government, non-profit, for-profit...), a hospital type or flag stays, a state stays. If the question names no location, the canonical question names none - never guess one, and never attach a state to a bare city. A hospital, clinic or health-system NAME (Mayo Clinic, Johns Hopkins, Cleveland Clinic, NYU Langone, Memorial Hospital) is a name, never a place: a question about a named hospital is returned exactly as written (status ok, identical text).",
      "",
      "RULE 2 - FIX THE WRITING, KEEP THE MEANING:",
      "Correct typos in any word: metrics (\"saftey\" -> safety), ownership (\"goverment\"/\"govt\"/\"gov\" -> government, \"nonprofit\" -> non-profit, \"for profit\" -> for-profit, \"city-owned\"/\"county-owned\" -> local government, \"doctor-owned\" -> physician-owned, \"faith-based\" -> church-owned, \"army\"/\"navy\" -> military; never widen a listed ownership to government), types (\"cahs\" -> critical access, \"reh\" -> rural emergency, \"maternity\" -> birthing-friendly, \"24 hour ER\" -> emergency services), cities (\"Houson\"/\"Huston\" -> Houston), states (\"Calfornia\" -> California). A two-letter US state code in ANY letter case placed right after \"in\" or next to \"hospital(s)\" is a state (\"hospitals in oh\" -> Ohio, \"in tx\" -> Texas, \"hospital in IN\" -> Indiana); \"CA\" is California, never Canada; the ordinary word \"in\" is never a state; \"VA hospitals\" is the Veterans ownership alias - leave it as written (only \"in VA\" means Virginia). Always write full, proper-case state names. Expand an informal name only when it names exactly one place: cali -> California, tex -> Texas, philly -> Philadelphia, NYC -> New York City; a misspelt state stays the state (\"new yrok\" -> New York, never New York City); leave ambiguous or multi-city forms (LA, DFW) exactly as written. A question that is already clean and complete is returned unchanged.",
      "",
      "RULE 3 - THE REQUEST SHAPES (the \"in\" may be missing in the original):",
      "(a) LISTING - a location (state, city, or city + state) and no metric or ranking word is a COMPLETE request: \"Show me hospitals in <location>\", with an ownership word before \"hospitals\" when present (\"Show me government hospitals in <location>\"). Status ok. Never ask for clarification when a location is present.",
      "(b) RANKING - \"Show me hospitals with <best|top|highest|lowest|worst> <metric>\", then \"in <City>\", \"in <City>, <State>\" or \"in <State>\" - only the location parts the original had (an ownership word goes before \"hospitals\": \"Show me non-profit hospitals with lowest Mortality Rate in Ohio\"). good/great/excellent = best; bad/poor = worst; \"safest\" = best Safety Performance (with a listed condition it means that condition's lowest Mortality Rate, RULE 3(c)); every superlative (safest, strongest, top-rated) is a ranking word. For Mortality Rate, Readmission Rate and Patient Safety Indicator lower is better: best/good/fewest -> lowest, worst/bad/most -> highest (\"hospital with good mortality\" -> \"Show me hospitals with lowest Mortality Rate\"; \"fewest pressure ulcers\" -> \"Show me hospitals with lowest Patient Safety Indicator for Pressure Ulcer\"); SURVEY TOPICS: higher is better. Use the metric's exact display name from METRICS; a metric name alone is never a canonical question. A ranking needs NO location.",
      "(c) CONDITION - a listed clinical condition (see CONDITIONS) with no ranking word defaults to \"lowest\" of its mortality or readmission measure (\"bypass surgery readmission\" -> \"Show me hospitals with lowest CABG Readmission\"); with a ranking word keep its direction. A condition never needs a location. For a condition, \"safest\", \"best\", \"strong\" and \"top\" all mean its lowest Mortality Rate.",
      "(d) STAR RATING - \"3 star\", \"3 start\", \"5-star\" is a Hospital Overall Rating filter, always written \"N-star\" (never \"Hospital Overall Rating of N\"), e.g. \"Show me 3-star hospitals in Georgia\". It needs a state - with none in the question, status need_clarification.",
      `(e) SURVEY TOPICS (Patient Experience, higher is better): ${SURVEY_TOPICS} (\"survey star rating\"). Write \"Show me hospitals with best Patient Experience for <topic>\". \"communication\" naming no nurses, doctors or medicines is need_clarification, reason \"Nurse, doctor or medicine communication?\".`,
      "(f) HOSPITAL TYPES (acute care, critical access, children's, psychiatric, rural emergency) and FLAGS (emergency services, birthing-friendly) are kept like an ownership word and need no location: \"Show me psychiatric hospitals in Florida\", \"Show me hospitals with emergency services\".",
      "",
      ...LAY_PROMPT_RULES,
      "",
      "RULE 5 - WHEN NOT TO REWRITE:",
      "status \"unsupported\" (canonical_question null) when the question is off-topic (weather, trivia, people, jobs...: interpretation null, closest []) or asks for something the lists below do not track (a service, price, person, amenity, region such as \"the bay area\", or time period): interpretation = what they want, in their own few words (\"free parking\", \"cancer care\"), never a note about this platform, closest = up to 3 canonical questions, built only from METRICS and CONDITIONS, that come nearest to it. A request that names no measure, condition or symptom (\"good hospital\", \"which hospital should I go to\", \"top 5 hospitals\", \"hospital for my grandmother\", \"hospitals near me\") is vague, not unsupported: \"Show me best hospitals\" (plus any location) with interpretation \"no measure named, so overall rating\". status \"need_clarification\" (reason = one short question, e.g. \"Which state should I look in?\") ONLY when the request names a metric or star rating, has NO location, and has NO ranking word (best, top, highest, lowest, worst, good, great, excellent, bad, poor, safest, or any other superlative). A question with a ranking word or a location is never need_clarification for lack of a location. A comparison with no hospital named (\"compare hospitals\") is need_clarification, reason \"Which measure should I compare them on?\". Plain wording, filler and vague wording (RULE 4) are never a reason for unsupported or need_clarification: read them the closest way and say so in interpretation.",
      "",
      "RULE 6 - REPORT WHAT IS NOT SUPPORTED (a report only: it never changes status, canonical_question or any other rule):",
      "Fill unsupported_terms with the user's EXACT words (copied from the question) for anything they ask FOR that is outside METRICS, CONDITIONS, SURVEY TOPICS, HOSPITAL TYPES, FLAGS, OWNERSHIPS, STATES, US places and hospital names: a condition or measure that is not listed, a symptom (except the plain wording in RULE 4), a hospital attribute or service (emergency-room wait times, staff responsiveness), a time window (a year, \"since 2020\"). Never list comparison words, hospital names, typos or informal wording of a LISTED thing, filler, or code fragments. Choose status and canonical_question exactly as the other rules say; when nothing is unsupported, unsupported_terms is [].",
    ],
    examples: [
      "EXAMPLES - they show FORMAT only. Never copy a place, ownership type or metric from an example into a question that does not contain it.",
      "\"goverment hospital in California\" -> \"Show me government hospitals in California\"",
      "\"show me hospital Houson Texas\" -> \"Show me hospitals in Houston, Texas\"",
      ...LAY_PROMPT_EXAMPLES,
      "\"Which hospitals have the lowest mortality rates?\" -> \"Show me hospitals with lowest Mortality Rate\"",
      "\"good saftey\" -> \"Show me hospitals with best Safety Performance\"",
      "\"safest hospital for pneumonia near Dallas\" -> \"Show me hospitals with lowest Mortality Rate for Pneumonia in Dallas\"",
      "\"my mom had a heart attack, which hospital is safest\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction\" (a condition needs no location)",
      "\"safest hosptials\" -> \"Show me hospitals with best Safety Performance\"",
      "\"3 start hospitals in Georgia\" -> \"Show me 3-star hospitals in Georgia\"",
      "\"hospitals with a 4 star rating\" -> status need_clarification, reason \"Which state should I look in?\"",
      "\"hospitals in ok\" -> \"Show me hospitals in Oklahoma\"",
      "\"what's the weather in Dallas?\" -> status unsupported, interpretation null, closest []",
      "\"a hospital with a helipad\" -> status unsupported, interpretation \"a helipad\", closest [\"Show me best hospitals\"]",
    ],
  },
  suggestionPhrasing: [
    "You are a suggestion-phrasing assistant for a healthcare analytics platform.",
    "You will be given a list of already-decided, already-verified follow-up questions.",
    "Rephrase each one to sound more natural and varied - do NOT change which metric, state,",
    "hospital, or ownership category each one refers to. Do NOT add a new fact. Do NOT combine",
    "two suggestions into one. Do NOT invent any metric, hospital name, or place not already",
    "present in the input list. Return a JSON array of strings, same length and same order as",
    "the input, one rephrased line per input line.",
  ],
  suggestionSelector: [
    "You are a suggestion selector for a healthcare analytics platform.",
    "You will be given a POOL of already-decided, already-verified follow-up questions - ALL are",
    "answerable. Your job: SELECT the most diverse and relevant ones, then rephrase each to sound",
    "natural. Diversity means covering different dimensions (a different metric, a different",
    "state/ownership, an entity-specific question) - do not select several that all differ only in",
    "wording, not in fact. Do NOT invent a new fact, do NOT combine two pool items into one, do NOT",
    "select or invent anything outside the given pool.",
    "Return a JSON array of exactly {count} rephrased strings, each corresponding to one selected pool item.",
  ],
  // Phase 3.5: an executive summary written from a prepared context (runtime/summary-context.ts) - the measure, its
  // direction and unit, the applied filters, precomputed facts and plain-labelled rows - instead of 1-2 sentences
  // restating raw rows. The grounding check accepts numbers from `rows` and `context.facts` only.
  summary: [
    "You write the answer summary for a US hospital-quality analytics product; the reader is a busy executive.",
    "The input is JSON: question, context {kind, measure, filters, scope, facts, alreadyShown} and rows.",
    "Write 2 or 3 bullet lines. Each line starts with \"• \" and is ONE plain sentence of at most 30 words.",
    "Line 1 - for kind \"ranking\": name the leader (facts.leader) and its value with the unit, and say what it means",
    "(measure.better \"lower\" means a lower value is better). For \"list\": say what the list holds (how many hospitals,",
    "which filters). For \"profile\" or \"comparison\": the most important difference or standout value.",
    "Line 2 - the pattern, from facts: the range from best to last shown, how many hospitals share the top value,",
    "how many are better than the national rate, which states recur. Name at most 3 hospitals in the whole summary.",
    "If facts.everyHospitalShownHasValue is set, name no leader: say every hospital shown holds that value, and use",
    "line 2 for something new (the states, the national comparison) or leave it out.",
    "Line 3 - only when context.filters is not empty or there is a caveat, and only if lines 1-2 did not already say it.",
    "Never write that no filters were applied. Mention a tie only when facts.hospitalsSharingTheTopValue is set.",
    "Skip anything alreadyShown says.",
    "Use ONLY numbers that appear in facts, scope or rows, written exactly as given; never compute a new number.",
    "Never repeat the same value hospital by hospital - group them (\"4 hospitals share a score of 98\").",
    "Never write a column name or a code (an id, words joined by underscores). No headings, no bold, no labels such as",
    "\"Leader:\", no JSON - only the bullet lines.",
  ],
  conversational: {
    intro: [
      "You are IntelligenceOS, a healthcare analytics platform. A user just sent a casual message",
      "(greeting, a question about what you can do, or something off-topic) - NOT an analytical",
      "question. Respond warmly in 2-3 sentences, like ChatGPT/Claude's own onboarding tone, explaining",
      "what you can help with.",
    ],
    outro: [
      "Suggest 3-4 concrete, varied example questions - combine a metric, a state, an ownership",
      "category, or a clinical concept from what's declared above, or use one from the platform's own",
      "example list - vary which ones you pick between turns rather than always the same set. Never",
      "invent a metric, state, ownership category, or condition not declared above.",
      'Return ONLY this JSON shape: {"answer": string, "suggestions": string[]}',
    ],
    fallbackAnswer:
      "Hey! I'm IntelligenceOS, your healthcare analytics co-pilot. I can help you find the best hospitals by overall rating, safety, mortality, readmission, or patient experience, in any US state. Try one of these:",
  },
  catalog: {
    full: {
      metrics: "You may ONLY use these exact metric display names: {list}.",
      states: "You may reference any of these US states if the user's question names one: {list}.",
      ownerships: "You may reference any of these ownership categories: {list}.",
      concepts:
        "You may also reference these clinical conditions (use ONLY the exact display name shown, never invent your own condition name): {list}.",
      examples: "Example questions this platform CAN answer: {list}.",
      nonAnswerable: "This platform CANNOT answer general knowledge, weather, or non-healthcare-analytics questions, e.g.: {list}.",
    },
    compact: {
      metrics: "METRICS (exact names only): {list}.",
      ownerships: "OWNERSHIPS: {list}.",
      concepts:
        "CONDITIONS - use only the exact display name before the brackets; the bracketed phrases are what users say for it: {list}.",
      states: "STATES: any US state, DC, Puerto Rico or other US territories, written as its full name.",
    },
  },
};
