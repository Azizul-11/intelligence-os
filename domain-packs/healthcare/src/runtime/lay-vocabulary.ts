/**
 * Batch 5A-1 (2026-09-21): the healthcare domain's layperson vocabulary. DATA ONLY, owned by the domain pack: exact
 * lower-case phrases matched on whole words, never fuzzily (no edit distance anywhere). Nothing under `packages/*`
 * names a healthcare word; the orchestrator's generic mapper (services/lay-mapper.ts) reads this structure through
 * `DOMAIN_CAPABILITIES.layVocabulary`.
 *
 * Why it exists: measured on 50 messy queries (docs .../5A_AUDIT_BOUNCER_TO_TRANSLATOR.md) 19 answerable asks were
 * refused because the pre-check or the model treated a layperson phrase ("heart problem", "checkup", "trouble
 * breathing") as unsupported, and the same intent got opposite outcomes depending on the wording. A phrase here
 * is answered by the same deterministic pipeline as any other question: the mapper only rewrites it to a canonical
 * question the pipeline already answers (verified by scripts/verify-batch5a1-vocab.ts), keeps every place and
 * ownership word the user typed, and reports what it read the phrase as.
 *
 * The four parts:
 *  - SPELLINGS: a typed misspelling -> the correct phrase (exact literals, applied before the pre-check, so
 *    "chruch owned" is refused as the "church owned" it is).
 *  - GROUPS: a layperson phrase (or a bare condition name) -> the question the pipeline answers, the reading shown
 *    to the user and up to three one-tap alternatives.
 *  - SCAFFOLD / FILLER: words dropped from the question ("show me", "checkup", "problem"): never a reason to refuse.
 *  - BLOCKERS: a metric, direction or comparison word. When one is typed the user asked a formal question and no
 *    group is applied, so "pneumonia readmissions" is never rewritten to pneumonia mortality.
 */

export interface LayAlternate {
  /** Shown in the note ("You can also view <label> below"). */
  label: string;
  /** A complete question the pipeline answers; the user's place / ownership words are appended. */
  base: string;
}

export interface LayGroup {
  id: string;
  /** Lower-case phrases, words separated by single spaces. */
  phrases: readonly string[];
  /** The complete question the pipeline answers; what is left of the user's question (place, ownership) is appended. */
  base: string;
  /** What the phrase was read as, e.g. "Heart Attack Mortality". */
  reading: string;
  alternates?: readonly LayAlternate[];
  /** Replaces the default "Showing <reading> for '<heard>'." sentence. `{heard}` is the user's own wording. */
  note?: string;
  /** No note at all (the rewrite is a plain synonym, e.g. "government owned" -> government hospitals). */
  silent?: boolean;
  /** When two groups with the same base match ("good hospital near me"), the higher priority supplies the note. */
  priority?: number;
  /** A generic group ("good hospital", "near me") yields to any specific group matched in the same question. */
  generic?: boolean;
  /** A phrase directly followed by one of these words is not this phrase ("for heart" + "failure"). */
  notFollowedBy?: readonly string[];
}

export interface LayVocabulary {
  spellings: Readonly<Record<string, string>>;
  groups: readonly LayGroup[];
  scaffold: readonly string[];
  filler: readonly string[];
  narration: readonly string[];
  blockers: readonly string[];
  /**
   * Words that may stay in the question next to a mapped phrase because they are slots the pipeline resolves
   * (ownership, "owned"). Anything else left over that is not a place (a state name, a code, a capitalised name) means
   * the mapper does not rewrite and the model decides.
   */
  slotWords: readonly string[];
}

// ------------------------------------------------------------------------------------------------ canonical repairs

/**
 * Batch 5A-2: a model can write a canonical question the pipeline cannot rank: "best Safety Performance for Pneumonia"
 * (seen live for "strong pneumonia outcomes", "hospital that treats pneumonia well", "which hospital is safest" after a heart
 * attack). Safety, patient experience and the overall rating are scored for a whole hospital, not for one condition, so the
 * pipeline refuses the question and the user gets a dead end. This is what such a phrase means in this domain: the
 * condition's own mortality. Applied ONLY to a model's rewrite (never to what the user typed), and always with the note.
 * Exact patterns, no fuzzy matching.
 */
export interface CanonicalRepair {
  /** Regular expression source, matched against the whole canonical question. */
  pattern: string;
  flags?: string;
  /** `String.replace` replacement (`$1`, `$2` are the pattern's groups). */
  replacement: string;
  /** Plain text shown to the user in place of the model's own reading. */
  note: string;
}

const WHOLE_HOSPITAL_METRICS = "(?:Safety Performance|Patient Experience|Hospital Overall Rating)";
const REPAIR_NOTE = "Showing the condition's mortality rate: safety and patient experience are scored for a whole hospital, not for one condition.";

export const CANONICAL_REPAIRS: readonly CanonicalRepair[] = [
  { pattern: `^(Show me .*?hospitals with) (?:best|top) ${WHOLE_HOSPITAL_METRICS} for (.+)$`, flags: "i", replacement: "$1 lowest Mortality Rate for $2", note: REPAIR_NOTE },
  { pattern: `^(Show me .*?hospitals with) (?:worst|bottom) ${WHOLE_HOSPITAL_METRICS} for (.+)$`, flags: "i", replacement: "$1 highest Mortality Rate for $2", note: REPAIR_NOTE },
];

// ------------------------------------------------------------------------------------------------ spellings

const HEART_TYPOS = ["hart", "hert"];
// typed follower -> the word it is corrected to (a follower may itself be misspelled: "hert attak")
const HEART_FOLLOWERS: Record<string, string> = {
  problem: "problem", problems: "problems", issue: "issue", issues: "issues", trouble: "trouble", pain: "pain", condition: "condition",
  disease: "disease", care: "care", surgery: "surgery", attack: "attack", attak: "attack", failure: "failure", failur: "failure",
  checkup: "checkup", checkups: "checkups", screening: "screening",
};

/**
 * A bare "hart" is a real name (Hart County, Hartford), so the heart typos are registered only together with the word
 * that makes them a heart phrase. Each key is an exact phrase.
 */
const HEART_SPELLINGS: Record<string, string> = Object.fromEntries(
  HEART_TYPOS.flatMap((typo) => Object.entries(HEART_FOLLOWERS).map(([typed, word]) => [`${typo} ${typed}`, `heart ${word}`] as const)),
);

export const SPELLINGS: Readonly<Record<string, string>> = {
  penumonia: "pneumonia",
  pneunomia: "pneumonia",
  pnemonia: "pneumonia",
  pnuemonia: "pneumonia",
  pneumonai: "pneumonia",
  attak: "attack",
  failur: "failure",
  hosptials: "hospitals",
  hospitls: "hospitals",
  hospitial: "hospital",
  hospitials: "hospitals",
  clinc: "clinic",
  chruch: "church",
  goverment: "government",
  complicatons: "complications",
  complicatoins: "complications",
  ...HEART_SPELLINGS,
};

// ------------------------------------------------------------------------------------------------ shared bases

const AMI = "Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction";
const HF = "Show me hospitals with lowest Mortality Rate for Heart Failure";
const CABG = "Show me hospitals with lowest Mortality Rate for CABG";
const COPD = "Show me hospitals with lowest Mortality Rate for COPD";
const PN = "Show me hospitals with lowest Mortality Rate for Pneumonia";
const PN_READMIT = "Show me hospitals with lowest Readmission Rate for Pneumonia";
const COPD_READMIT = "Show me hospitals with lowest Readmission Rate for COPD";
const HIP_KNEE = "Show me hospitals with lowest hip and knee replacement complication rate";
const HIP_KNEE_READMIT = "Show me hospitals with lowest Hip Knee Readmission";
const BEST = "Show me best hospitals";

// ------------------------------------------------------------------------------------------------ groups

export const LAY_GROUPS: readonly LayGroup[] = [
  // --- cardiac ---
  {
    id: "chest-pain",
    phrases: ["chest pain", "chest pains", "chest discomfort", "chest hurts", "my chest hurts", "my heart hurts", "heart hurts", "heart pain", "heart pains", "heart ache", "heartache"],
    base: AMI,
    reading: "Heart Attack Mortality",
  },
  {
    id: "heart-general",
    phrases: [
      "heart problem", "heart problems", "heart issue", "heart issues", "heart trouble", "heart troubles", "heart condition",
      "heart conditions", "heart disease", "heart diseases", "heart care", "heart checkup", "heart checkups", "heart screening",
      "cardiac care", "cardiac", "for heart",
    ],
    notFollowedBy: ["attack", "attacks", "failure", "surgery", "transplant", "rate", "rates"],
    base: AMI,
    reading: "Heart Attack Mortality",
    alternates: [
      { label: "Heart Failure", base: HF },
      { label: "Bypass Surgery", base: CABG },
    ],
  },
  {
    id: "weak-heart",
    phrases: ["weak heart", "heart not pumping", "heart is not pumping"],
    base: HF,
    reading: "Heart Failure Mortality",
    alternates: [{ label: "Heart Attack", base: AMI }],
  },
  {
    id: "heart-surgery",
    phrases: ["heart surgery", "heart surgeries", "open heart surgery", "open heart", "heart operation"],
    base: CABG,
    reading: "Bypass Surgery (CABG) Mortality, the heart-surgery measure I track",
    alternates: [{ label: "Heart Attack", base: AMI }],
  },
  // --- respiratory ---
  {
    id: "breathing",
    phrases: [
      "trouble breathing", "breathing trouble", "breathing problem", "breathing problems", "breathing issue", "breathing issues",
      "difficulty breathing", "hard to breathe", "hard breathing", "short of breath", "shortness of breath", "breathlessness",
      "out of breath", "winded", "for breathing",
    ],
    base: COPD,
    reading: "COPD Mortality",
    alternates: [
      { label: "Pneumonia", base: PN },
      { label: "COPD Readmissions", base: COPD_READMIT },
    ],
  },
  {
    id: "lung",
    phrases: ["lung disease", "lung diseases", "lung problem", "lung problems", "lung trouble", "lungs acting up", "lungs are acting up", "lungs hurt", "bad lungs", "weak lungs", "emphysema", "chronic bronchitis"],
    base: COPD,
    reading: "COPD Mortality",
    alternates: [{ label: "Pneumonia", base: PN }],
  },
  {
    id: "chest-infection",
    phrases: ["chest infection", "chest infections", "lung infection", "lung infections"],
    base: PN,
    reading: "Pneumonia Mortality",
    alternates: [{ label: "COPD", base: COPD }],
  },
  // --- joints ---
  {
    id: "joint",
    phrases: [
      "hip problem", "hip problems", "knee problem", "knee problems", "hip issue", "knee issue", "hip pain", "knee pain", "hip surgery",
      "knee surgery", "joint replacement", "joint replacements", "joint problem", "joint problems", "new hip", "new knee",
    ],
    base: HIP_KNEE,
    reading: "Hip/Knee Replacement Complications",
    alternates: [{ label: "Hip/Knee Readmissions", base: HIP_KNEE_READMIT }],
  },
  // --- a bare formal condition: the pipeline needs a measure, the default is the condition's 30-day mortality ---
  { id: "pneumonia", phrases: ["pneumonia"], base: PN, reading: "Pneumonia Mortality", alternates: [{ label: "Pneumonia Readmissions", base: PN_READMIT }] },
  {
    id: "heart-attack",
    phrases: ["heart attack", "heart attacks", "ami"],
    base: AMI,
    reading: "Heart Attack Mortality",
    alternates: [{ label: "Heart Failure", base: HF }],
  },
  { id: "heart-failure", phrases: ["heart failure", "chf"], base: HF, reading: "Heart Failure Mortality", alternates: [{ label: "Heart Attack", base: AMI }] },
  { id: "copd", phrases: ["copd", "chronic obstructive pulmonary disease"], base: COPD, reading: "COPD Mortality", alternates: [{ label: "COPD Readmissions", base: COPD_READMIT }] },
  { id: "bypass", phrases: ["cabg", "bypass surgery", "coronary bypass", "bypass"], base: CABG, reading: "Bypass Surgery (CABG) Mortality" },
  {
    id: "hip-knee",
    phrases: ["hip replacement", "knee replacement", "hip and knee replacement", "hip and knee", "hip knee", "total hip", "total knee"],
    base: HIP_KNEE,
    reading: "Hip/Knee Replacement Complications",
    alternates: [{ label: "Hip/Knee Readmissions", base: HIP_KNEE_READMIT }],
  },
  // --- quality without a measure: the overall star rating ---
  {
    id: "quality",
    phrases: [
      "good hospital", "good hospitals", "great hospital", "great hospitals", "which hospital is good", "which hospitals are good",
      "which hospital is best", "which hospitals are best", "best hospitals in general", "hospitals in general", "some hospitals",
      "any hospital", "any hospitals", "which hospital should i go to", "which hospital should i choose", "where should i go",
      "help me find a hospital", "find me a hospital", "find a hospital", "what hospitals do you have", "which hospitals do you have",
      "what hospitals are there",
    ],
    base: BEST,
    reading: "Hospital Overall Rating",
    note: "You didn't name a measure, so I'm showing the highest overall-rated hospitals for '{heard}'.",
    generic: true,
  },
  {
    id: "near-me",
    phrases: ["near me", "nearby", "close to me", "around me", "around here", "nearest hospital", "closest hospital"],
    base: BEST,
    reading: "Hospital Overall Rating",
    note: "I can't see your location, so I'm showing the highest overall-rated hospitals nationwide. Tell me a city or state to narrow it.",
    priority: 1,
    generic: true,
  },
  {
    id: "patient-experience",
    phrases: ["happy patients", "treated well", "bedside manner", "good service", "good experience"],
    base: "Show me hospitals with best Patient Experience",
    reading: "Patient Experience",
  },
  // --- ownership as a plain synonym ---
  { id: "government-owned", phrases: ["government owned", "government run", "state run", "publicly owned"], base: "Show me government hospitals", reading: "Government hospitals", silent: true },
];

// ------------------------------------------------------------------------------------------------ filler

/** Dropped without comment: the request's scaffolding. */
export const SCAFFOLD: readonly string[] = [
  "please", "pls", "kindly", "hey", "hi", "hello", "can", "could", "would", "will", "you", "your", "i", "im", "ive", "me", "my", "we",
  "our", "us", "show", "tell", "give", "find", "get", "list", "need", "want", "wanna", "looking", "look", "help", "for", "the", "a", "an",
  "is", "are", "am", "was", "be", "to", "go", "do", "does", "what", "whats", "which", "where", "who", "how", "there", "that", "this",
  "with", "of", "about", "any", "some", "best", "good", "great", "top", "better", "hospital", "hospitals", "place", "places", "should",
];

/** Health words that ask for nothing the platform measures on its own ("pneumonia screening"). */
const TOPICAL_FILLER: readonly string[] = [
  "checkup", "checkups", "check", "up", "screening", "screenings", "test", "tests", "testing", "treatment", "treatments", "care",
  "visit", "visits", "symptom", "symptoms", "problem", "problems", "issue", "issues", "trouble", "concern", "concerns", "recommend",
  "recommended", "recommendation", "general",
];

/** How people narrate a request ("my dad has trouble breathing, I get out of breath easily"). */
const NARRATION_FILLER: readonly string[] = [
  "easily", "really", "very", "always", "often", "lately", "recently", "just", "also", "quite", "badly", "dad", "mom", "mother",
  "father", "wife", "husband", "son", "daughter", "grandma", "grandpa", "grandmother", "grandfather", "friend", "parent", "parents",
  "family", "has", "have", "had", "having", "get", "gets", "getting", "got", "feel", "feels", "feeling", "been", "being", "were", "trust", "trusted",
];

/** Dropped and reported; the health words next to a phrase are quoted with it, the narration is not. */
export const FILLER: readonly string[] = TOPICAL_FILLER;
export const NARRATION: readonly string[] = NARRATION_FILLER;

/** See LayVocabulary.slotWords; a multi-word entry ("for profit") is kept whole, whatever the scaffold list says about "for". */
export const SLOT_WORDS: readonly string[] = [
  "government", "gov", "govt", "nonprofit", "non profit", "not for profit", "for profit", "proprietary", "private", "public",
  "federal", "state", "local", "county", "city", "va", "veterans", "owned", "run", "and", "or",
];

/** A group is not applied when the user typed one of these: a metric, a direction or a comparison. */
export const BLOCKERS: readonly string[] = [
  "mortality", "mortalities", "death", "deaths", "die", "died", "dies", "dying", "readmission", "readmissions", "readmitted",
  "complication", "complications", "rate", "rates", "rating", "ratings", "safety", "safest", "experience", "satisfaction", "compare",
  "comparison", "versus", "vs", "than", "between", "average", "national", "benchmark", "above", "below", "worse", "worst", "bottom",
  "highest", "lowest", "most", "least", "fewest", "rank", "ranked", "ranking",
];

/**
 * Single words the query planner may leave unaccounted (packages/query-planner reads them as data through its
 * constructor): the topical filler, so "checkup" or "screening" no longer stops a default ranking.
 *
 * NOT the symptom words ("problem", "issue", "trouble", "symptom", "concern"). Measured live (2026-09-21): with them
 * tolerated, "hart problem" (a typo, and a real county: Hart County) counted as fully understood - the county plus
 * filler - so the front door and this vocabulary were skipped and the answer was an empty county list. Left
 * unaccounted, such a phrase reaches the vocabulary, which drops the word itself when it sits next to a mapped phrase.
 */
const SYMPTOM_WORDS = new Set(["problem", "problems", "issue", "issues", "trouble", "symptom", "symptoms", "concern", "concerns"]);
export const HEALTHCARE_FILLER_WORDS: readonly string[] = TOPICAL_FILLER.filter((word) => !SYMPTOM_WORDS.has(word));

export const LAY_VOCABULARY: LayVocabulary = {
  spellings: SPELLINGS,
  groups: LAY_GROUPS,
  scaffold: SCAFFOLD,
  filler: FILLER,
  narration: NARRATION,
  blockers: BLOCKERS,
  slotWords: SLOT_WORDS,
};

// ------------------------------------------------------------------------------------------------ scope guidance

export interface ScopeGuidance {
  /** Unsupported topic phrases (lower case) this entry answers for. */
  topics: readonly string[];
  /** How to name what the user asked for; the phrase they typed is used when absent. */
  label?: string;
  /** Complete questions the platform answers, closest to the intent first. */
  chips: readonly string[];
}

const MORTALITY = "Show me hospitals with lowest Mortality Rate";
const OVERALL = "Show me hospitals with best Hospital Overall Rating";
const SAFETY = "Show me hospitals with best Safety Performance";
const EXPERIENCE = "Show me hospitals with best Patient Experience";
const READMIT = "Show me hospitals with lowest Readmission Rate";

/**
 * What to offer when the question names something the platform does not answer (the unsupported topics in
 * capability-catalog.ts). Every chip is dry-run validated by the runtime before it is shown, and by
 * scripts/verify-batch5a1-vocab.ts, so none can lead to a dead end.
 */
export const SCOPE_GUIDANCE: readonly ScopeGuidance[] = [
  { topics: ["stroke"], label: "stroke hospitals", chips: [AMI, HF, MORTALITY] },
  { topics: ["sepsis"], label: "sepsis care", chips: [PN, SAFETY, MORTALITY] },
  {
    topics: ["psi", "patient safety indicator", "patient safety indicators", "pressure ulcer", "pressure ulcers", "in-hospital falls", "falls with fracture", "blood clot", "blood clots", "hospital acquired infection", "hospital acquired infections", "kidney injury"],
    label: "that specific safety measure",
    chips: [SAFETY, OVERALL, MORTALITY],
  },
  { topics: ["hospital wide", "all cause"], label: "hospital-wide results", chips: [MORTALITY, OVERALL, READMIT] },
  {
    topics: ["nurse communication", "doctor communication", "communication about medicines", "discharge information", "instructions for going home", "listen carefully", "responsiveness", "cleanliness", "cleanest", "sanitary", "quietest"],
    label: "that patient-survey detail",
    chips: [EXPERIENCE, OVERALL, SAFETY],
  },
  {
    topics: ["emergency services", "emergency department", "ed wait", "ed waits", "er wait", "er waits", "wait time", "wait times", "volumes"],
    label: "emergency-room information",
    chips: [OVERALL, SAFETY, EXPERIENCE],
  },
  { topics: ["birthing friendly", "birthing-friendly"], label: "birthing-friendly hospitals", chips: [EXPERIENCE, OVERALL, SAFETY] },
  { topics: ["hospital type", "acute care", "critical access", "childrens", "children's", "psychiatric", "rural emergency"], label: "that hospital type", chips: [OVERALL, SAFETY, EXPERIENCE] },
  {
    topics: ["physician owned", "tribal", "military", "department of defense", "church owned"],
    label: "{term} hospitals",
    chips: ["Show me government hospitals", "Show me non-profit hospitals with lowest Mortality Rate", "Show me proprietary hospitals with best Hospital Overall Rating"],
  },
  { topics: ["dc", "d.c.", "district of columbia"], label: "hospitals in Washington DC", chips: ["Show me best hospitals in Maryland", "Show me best hospitals in Virginia", "Show me hospitals with best Patient Experience in Maryland"] },
  { topics: ["since", "over time", "years ago", "time trend", "time trends"], label: "results over time (I only have the latest data)", chips: [OVERALL, MORTALITY, READMIT] },
  { topics: ["address", "phone number", "patient records"], label: "contact details or patient records", chips: [OVERALL, SAFETY, EXPERIENCE] },
  {
    topics: ["price", "prices", "pricing", "how much does", "how much is", "how much do", "doctors", "surgeons"],
    label: "prices or individual doctors",
    chips: [OVERALL, MORTALITY, EXPERIENCE],
  },
  { topics: ["decile"], label: "decile rankings", chips: [OVERALL, MORTALITY, SAFETY] },
];

// ------------------------------------------------------------------------------------------------ prompt text

/**
 * The condition each plain-wording group is read as, for the prompt. Compact on purpose: the normalizer prompt has a
 * size budget (the free fallback tier is 8,000 tokens per minute; scripts/verify-llm-first-front-door.ts I1 holds it
 * to 9,000 characters), so the mortality question pattern is stated once and each line only names its condition.
 */
export const PROMPT_CONDITIONS: readonly { phrases: readonly string[]; condition: string }[] = [
  { phrases: ["chest pain", "heart pain", "heart problem", "heart issue", "heart care"], condition: "Acute Myocardial Infarction" },
  { phrases: ["trouble breathing", "breathing problem", "shortness of breath", "lung disease"], condition: "COPD" },
  { phrases: ["chest infection", "lung infection"], condition: "Pneumonia" },
  { phrases: ["heart surgery"], condition: "CABG" },
  { phrases: ["weak heart"], condition: "Heart Failure" },
];
export const PROMPT_JOINT_PHRASES: readonly string[] = ["hip problem", "knee problem", "joint replacement"];

const promptPhrases = (phrases: readonly string[]): string => phrases.map((phrase) => `"${phrase}"`).join(", ");

/**
 * Batch 5A-1: RULE 4 of the normalizer prompt, supplied by the domain (it used to be hard-coded HEART LANGUAGE text in
 * packages/llm-model-gateway, which ended in "a bare heart problem ... is ambiguous - status fallback, never guessed").
 * Generated from the vocabulary above, so the model and the deterministic mapper read a phrase the same way.
 */
export const LAY_PROMPT_RULES: readonly string[] = [
  "RULE 4 - PLAIN WORDING (map it, never refuse it):",
  "Read a plain phrase as the closest reading below, write the canonical question (plus any location) and note how you read it in interpretation (\"Read 'chest pain' as heart attack\"); interpretation is null for literal wording.",
  `Mortality questions: "Show me hospitals with lowest Mortality Rate for <Condition>". ${PROMPT_CONDITIONS.map((c) => `${promptPhrases(c.phrases)} -> ${c.condition}`).join("; ")}.`,
  `${promptPhrases(PROMPT_JOINT_PHRASES)} -> "${LAY_GROUPS.find((group) => group.id === "joint")!.base}".`,
  "Filler (\"checkup\", \"screening\", \"test\", \"problem\", \"issue\", \"please\", \"recommend\") is dropped and listed in filler_dropped: never a reason to refuse or ask, never an unsupported term.",
];

/** Format examples for the rules above; they used to be hard-coded in the gateway. */
export const LAY_PROMPT_EXAMPLES: readonly string[] = [
  "\"best hospital for heart pain Houston\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Houston\"",
  "\"best hospital for chest pain in Columbus, Ohio\" -> \"Show me hospitals with lowest Mortality Rate for Acute Myocardial Infarction in Columbus, Ohio\"",
  "\"hospital for trouble breathing in Ohio\" -> \"Show me hospitals with lowest Mortality Rate for COPD in Ohio\"",
];

const escapeForRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COLLIDING_TYPOS = Object.entries(HEART_SPELLINGS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([from, to]) => ({ pattern: new RegExp(`(?<![\\p{L}\\p{N}])${from.split(" ").map(escapeForRegex).join("\\s+")}(?![\\p{L}\\p{N}])`, "giu"), to }));

/**
 * A misspelling that IS a real place name is corrected before the question is resolved. "hart" is Hart County, so
 * "hart checkup" resolves to that county plus filler and is answered as an (empty) county list: the front door and the
 * vocabulary never see it. Only the exact phrases in HEART_SPELLINGS (a heart word after "hart" / "hert") are
 * touched, so "hospitals in Hart County" is left alone. Every other misspelling is corrected by the orchestrator's
 * vocabulary step, which keeps what the user typed for the note.
 */
export function correctPlaceCollidingTypos(question: string): string {
  return COLLIDING_TYPOS.reduce(
    (text, { pattern, to }) => text.replace(pattern, (matched) => (/^\p{Lu}/u.test(matched) ? to.charAt(0).toUpperCase() + to.slice(1) : to)),
    question,
  );
}

const lookupWords = (text: string): string => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
const SPELLING_ENTRIES = Object.entries(SPELLINGS).sort((a, b) => b[0].length - a[0].length);

/** The text as whole lower-case words, exact misspellings corrected, padded with a space each side (for phrase lookups). */
export function correctedWords(text: string): string {
  return SPELLING_ENTRIES.reduce((padded, [from, to]) => padded.split(` ${from} `).join(` ${to} `), lookupWords(text));
}

/**
 * The tappable questions that answer for the unsupported topic a question names ("stroke hospitals" -> heart attack,
 * heart failure, lowest mortality), or undefined when it names none the guidance covers. A misspelt topic
 * ("chruch owned") is found too: the lookup runs on the corrected words.
 */
export function scopeGuidanceChips(question: string): readonly string[] | undefined {
  const padded = correctedWords(question);
  const entry = SCOPE_GUIDANCE.find((guidance) => guidance.topics.some((topic) => padded.includes(lookupWords(topic))));

  return entry?.chips;
}

/** One sentence naming everything the platform answers today; used by the graceful "I currently track ..." reply. */
export const COVERAGE_SUMMARY =
  "heart attack, heart failure, pneumonia, COPD and bypass surgery mortality and readmission, hip and knee replacement complications, plus hospital ratings, safety, patient experience and ownership";
