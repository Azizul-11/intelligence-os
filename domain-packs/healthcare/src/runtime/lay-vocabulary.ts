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

// Batch 5C: a procedure is not a metric either ("best CABG", seen live for "my uncle needs a bypass, who is good in Michigan"):
// what is ranked for a procedure is its 30-day mortality, exactly as for a condition. A bare "Show me hospitals" (seen for
// "hospitals please") names no measure at all and is a dead end; it means the overall rating, as the vague-ask rule says.
const CABG_NAMES = "(?:CABG|Coronary Artery Bypass(?: Graft(?:s|ing)?)?|Bypass(?: Surgery)?)";
const CABG_NOTE = "Showing Bypass Surgery (CABG) Mortality, the bypass-surgery measure I track.";
const STROKE_NOTE = "Showing Stroke Mortality, the stroke measure I track.";
const VAGUE_NOTE = "You didn't name a measure, so I'm showing the highest overall-rated hospitals.";

// Batch 5B-2: a Patient Safety Indicator is a complication or death rate, never a mortality rate and never a
// whole-hospital metric - these repairs must run BEFORE the WHOLE_HOSPITAL_METRICS ones below (repairCanonical
// stops at the first match), or "best Safety Performance for Postoperative Sepsis" would be repaired to the wrong
// measure (Mortality Rate) instead of this one.
// Kept in step with the trimmed alias set actually registered (aliases/psi.ts, aliases/sepsis.ts) - a repaired
// phrase this regex does not resolve afterward would be a dead end.
const PSI_NAMES =
  "(?:PSI[ -]?90|PSI[ -]?13|Pressure Ulcers?|Death After Serious Surgical Complication|" +
  "Failure to Rescue|Iatrogenic Pneumothorax|Collapsed Lung|In-Hospital Falls? With Fracture|" +
  "Postoperative Hemorrhage(?: or Hematoma)?|Postoperative Acute Kidney Injury|" +
  "Kidney Injury Requiring Dialysis|Postoperative Respiratory Failure|Respiratory Failure After Surgery|Perioperative Blood Clot|" +
  "Blood Clots After Surgery|Postoperative Sepsis|" +
  "Postoperative Wound Dehiscence|Wound Dehiscence|Accidental Puncture(?: or Laceration)?|" +
  "Patient Safety Composite)";
const PSI_NOTE = "Showing the Patient Safety Indicator rate: it is a complication or death rate, not a whole-hospital metric or a mortality rate.";
const PSI_BETTER = "(?:best|top|lowest|fewest)";
const PSI_WORSE = "(?:worst|bottom|highest|most)";
// D2: the model can name the metric but drop which indicator ("highest PSI 90 patient safety scores" was rewritten
// live to "Show me hospitals with highest Patient Safety Indicator"); with no indicator named, the composite is meant.
const PSI_COMPOSITE_NOTE = "No specific safety indicator was named, so this shows the PSI 90 Patient Safety Composite.";
// Batch 5B-3: a patient-survey dimension IS a Patient Experience topic, so "best Patient Experience for Cleanliness" is
// the correct canonical question and must never be "repaired" to a condition's mortality below; and a model that writes
// the dimension as if it were a metric ("best Cleanliness") gets the Patient Experience question back.
const SURVEY_NAMES =
  "(?:Cleanliness|Quietness|Nurse Communication|Doctor Communication|Communication About Medicines|Discharge Information|" +
  "Recommend Hospital|Overall Survey Rating|Survey Summary Star)";
const SURVEY_NOTE = "Showing that patient-survey score (higher is better).";
// Batch 5B-4: the hospital types and flags as a model writes them (runtime/hospital-attribute-directory.ts).
const TYPE_FLAG_WORDS =
  "(?:acute care|small rural critical access|critical access|small rural|cahs|children'?s|pediatric|psychiatric|rural emergency|reh|emergency services|" +
  "birthing[- ]friendly|maternity|labor and delivery)";
const TYPE_WORDS = "(?:acute care|critical access|children'?s|pediatric|psychiatric|rural emergency)";
// The ownership words as the rewrite prompt lists them (capability-catalog.ts `ownerships`) plus their common spellings.
const OWNERSHIP_WORDS =
  "(?:non[- ]?profit|for[- ]profit|proprietary|government|public|private|veterans|VA|church[- ]owned|physician[- ]owned|tribal|military|federal|" +
  "local[- ]government|hospital[- ]district|state[- ]owned)";
const TYPE_NOTE = "A hospital type is not a condition, so this shows those hospitals by their CMS overall star rating.";
const RATED_NOTE = "Showing the CMS overall star rating, the rating that ranks whole hospitals.";
const BIRTHING_NOTE = "Showing hospitals with the CMS Birthing-Friendly designation.";

export const CANONICAL_REPAIRS: readonly CanonicalRepair[] = [
  {
    pattern: "^(Show me .*?hospitals with (?:best|top|highest|lowest|worst|bottom|most|fewest)) Patient Safety Indicators?( in .+)?[.?!]*$",
    flags: "i",
    replacement: "$1 Patient Safety Indicator for Patient Safety Composite$2",
    note: PSI_COMPOSITE_NOTE,
  },
  // 2,000 sweep (RC02, 137 rows): the model also writes the indicator with lowest/highest/fewest/most, as a "Mortality Rate
  // for" question, or bare ("lowest Postoperative Sepsis"), sometimes with a trailing "rate"; each was a dead end ("could not be
  // carried through to planning" / "Unable to create query plan"). A PSI is lower-is-better: lowest/fewest/best/top -> lowest.
  { pattern: `^(Show me .*?hospitals with) ${PSI_BETTER} (?:${WHOLE_HOSPITAL_METRICS}|Mortality Rate) for (${PSI_NAMES})(?: Rates?)?( in .+)?[.?!]*$`, flags: "i", replacement: "$1 lowest Patient Safety Indicator for $2$3", note: PSI_NOTE },
  { pattern: `^(Show me .*?hospitals with) ${PSI_WORSE} (?:${WHOLE_HOSPITAL_METRICS}|Mortality Rate) for (${PSI_NAMES})(?: Rates?)?( in .+)?[.?!]*$`, flags: "i", replacement: "$1 highest Patient Safety Indicator for $2$3", note: PSI_NOTE },
  { pattern: `^(Show me .*?hospitals with) ${PSI_BETTER} (${PSI_NAMES})(?: Rates?)?( in .+)?[.?!]*$`, flags: "i", replacement: "$1 lowest Patient Safety Indicator for $2$3", note: PSI_NOTE },
  { pattern: `^(Show me .*?hospitals with) ${PSI_WORSE} (${PSI_NAMES})(?: Rates?)?( in .+)?[.?!]*$`, flags: "i", replacement: "$1 highest Patient Safety Indicator for $2$3", note: PSI_NOTE },
  // 2,000 sweep (Batch B2): hospital types and the birthing flag as the model wrote them live. A type is not a condition, a
  // "rated" type is ranked by the overall rating (as "best <type> hospitals" below), and "with birthing-friendly services" is
  // the birthing-friendly hospitals. Before the WHOLE_HOSPITAL_METRICS repairs, which would send a type to a mortality rate.
  { pattern: `^(Show me) (?:top|highest|best)[- ]rated (${TYPE_FLAG_WORDS}) (?:hospitals|facilities)( in .+)?[.?!]*$`, flags: "i", replacement: "$1 $2 hospitals with best Hospital Overall Rating$3", note: RATED_NOTE },
  { pattern: `^(Show me) hospitals with (?:best|top|highest|lowest) (?:Mortality Rate|Safety Performance|Patient Experience|Hospital Overall Rating) for (${TYPE_WORDS})(?: hospitals| facilities)?( in .+)?[.?!]*$`, flags: "i", replacement: "$1 $2 hospitals with best Hospital Overall Rating$3", note: TYPE_NOTE },
  { pattern: `^Show me (.*?)hospitals with birthing[- ]friendly(?: services| flag| designation| status| care)?( in .+)?[.?!]*$`, flags: "i", replacement: "Show me $1birthing-friendly hospitals$2", note: BIRTHING_NOTE },
  {
    pattern: `^(Show me .*?hospitals with) (best|top|highest|lowest|worst|bottom) (${SURVEY_NAMES})( in .+)?[.?!]*$`,
    flags: "i",
    replacement: "$1 $2 Patient Experience for $3$4",
    note: SURVEY_NOTE,
  },
  { pattern: `^(Show me .*?hospitals with) (?:best|top) ${WHOLE_HOSPITAL_METRICS} for (?!${SURVEY_NAMES}\\b)(.+)$`, flags: "i", replacement: "$1 lowest Mortality Rate for $2", note: REPAIR_NOTE },
  { pattern: `^(Show me .*?hospitals with) (?:worst|bottom) ${WHOLE_HOSPITAL_METRICS} for (?!${SURVEY_NAMES}\\b)(.+)$`, flags: "i", replacement: "$1 highest Mortality Rate for $2", note: REPAIR_NOTE },
  { pattern: `^(Show me .*?hospitals with) (?:best|top) ${CABG_NAMES}( in .+)?$`, flags: "i", replacement: "$1 lowest Mortality Rate for CABG$2", note: CABG_NOTE },
  // 2,000 sweep (Batch C): the model wrote "good hospitals for a stroke in Idaho" as "best Stroke in Idaho" (no measure) - a
  // dead end; what is ranked for a condition is its mortality, as for CABG above.
  { pattern: `^(Show me .*?hospitals with) (?:best|top|good) Strokes?(?: (?:treatment|care|results?|outcomes?))*( in .+)?[.?!]*$`, flags: "i", replacement: "$1 lowest Mortality Rate for Stroke$2", note: STROKE_NOTE },
  { pattern: `^(Show me .*?hospitals with) (?:worst|bottom) Strokes?(?: (?:treatment|care|results?|outcomes?))*( in .+)?[.?!]*$`, flags: "i", replacement: "$1 highest Mortality Rate for Stroke$2", note: STROKE_NOTE },
  { pattern: `^(Show me .*?hospitals with) (?:worst|bottom) ${CABG_NAMES}( in .+)?$`, flags: "i", replacement: "$1 highest Mortality Rate for CABG$2", note: CABG_NOTE },
  { pattern: "^Show me (?:all |some |the )?hospitals[.?!]*$", flags: "i", replacement: "Show me best hospitals", note: VAGUE_NOTE },
  // Batch 5B-4: the model keeps a hospital type or flag in the vague-ask shape ("best children's hospitals" -> "Show me
  // best children's hospitals"), which names no metric the planner can see; the overall rating is what "best" means
  // (RULE 5), written in the ranking shape the planner answers. A type CMS never rates is then listed (D11).
  { pattern: `^(Show me) (best|top) (${TYPE_FLAG_WORDS}) hospitals( in .+)?[.?!]*$`, flags: "i", replacement: "$1 $3 hospitals with $2 Hospital Overall Rating$4", note: VAGUE_NOTE },
  // 2,000 sweep (Batch B1): the same dead end with an ownership word ("Show me best local government hospitals in Nevada",
  // and "best non-profit hospitals" alike): the planner answers the ranking shape, "<ownership> hospitals with best ...".
  { pattern: `^(Show me) (best|top) (${OWNERSHIP_WORDS}) hospitals( in .+)?[.?!]*$`, flags: "i", replacement: "$1 $3 hospitals with $2 Hospital Overall Rating$4", note: VAGUE_NOTE },
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
  hospitol: "hospital",
  // 2,000 sweep (Batch C): typos seen in the survey, survival and stroke asks.
  recomend: "recommend",
  patiens: "patients",
  ratting: "rating",
  doctr: "doctor",
  lowst: "lowest",
  mortalty: "mortality",
  storke: "stroke",
  masachusetts: "massachusetts",
  clinc: "clinic",
  chruch: "church",
  goverment: "government",
  complicatons: "complications",
  complicatoins: "complications",
  // 2,000 sweep (Batch D)
  gaum: "guam",
  spotess: "spotless",
  nurce: "nurse",
  // Batch E
  florda: "florida",
  hopsitals: "hospitals",
  hopsital: "hospital",
  surgury: "surgery",
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
// Batch 5B-1
const STROKE = "Show me hospitals with lowest Mortality Rate for Stroke";
const HOSPITAL_WIDE_MORTALITY = "Show me hospitals with lowest Mortality Rate for Hospital-Wide Mortality";
// Batch 5B-2
const PSI_SEPSIS = "Show me hospitals with lowest Patient Safety Indicator for Postoperative Sepsis";
const PSI_COMPOSITE = "Show me hospitals with lowest Patient Safety Indicator for Patient Safety Composite";
const PSI_PRESSURE_ULCER = "Show me hospitals with lowest Patient Safety Indicator for Pressure Ulcer";
const PSI_FALL_FRACTURE = "Show me hospitals with lowest Patient Safety Indicator for In-Hospital Fall With Fracture";
const PSI_KIDNEY_INJURY = "Show me hospitals with lowest Patient Safety Indicator for Postoperative Acute Kidney Injury";
const PSI_BLOOD_CLOT = "Show me hospitals with lowest Patient Safety Indicator for Perioperative Blood Clot";
const PSI_FAILURE_TO_RESCUE = "Show me hospitals with lowest Patient Safety Indicator for Death After Serious Surgical Complication";
// Batch 5B-3: a patient-survey dimension is higher-is-better, so its canonical question says "best".
const SURVEY = (dimension: string): string => `Show me hospitals with best Patient Experience for ${dimension}`;
const SURVEY_CLEAN = SURVEY("Cleanliness");
const SURVEY_QUIET = SURVEY("Quietness");
const SURVEY_NURSE = SURVEY("Nurse Communication");
const SURVEY_DOCTOR = SURVEY("Doctor Communication");
const SURVEY_MEDICINES = SURVEY("Communication About Medicines");
const SURVEY_DISCHARGE = SURVEY("Discharge Information");
const SURVEY_RECOMMEND = SURVEY("Recommend Hospital");
const SURVEY_OVERALL = SURVEY("Overall Survey Rating");
const SURVEY_STAR = SURVEY("Survey Summary Star");
// 2,000 sweep (Batch C): the survey's worst-first asks ("least recommended", "loudest at night", "patients rate lowest").
const SURVEY_WORST = (dimension: string): string => `Show me hospitals with worst Patient Experience for ${dimension}`;
const HOSPITAL_WIDE_MORTALITY_WORST = "Show me hospitals with highest Mortality Rate for Hospital-Wide Mortality";
const SURVIVAL_NOTE = "Read '{heard}' as hospital-wide mortality, the death rate across all of a hospital's patients (lower is better, so better survival is a lower rate).";
/** "<dimension> score(s)" and "<dimension> ranking(s)": the metric word is part of the phrase, so it is not a blocker here. */
const withScoreWords = (terms: readonly string[]): string[] =>
  terms.flatMap((term) => [term, `${term} score`, `${term} scores`, `${term} ranking`, `${term} rankings`]);

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
  // 2,000 sweep (Batch D): "which hospitals lead each state" has no ranking word the engine reads (and "lead" cannot be
  // one - lexical-rewrites.ts), so the model asked which measure; the plain reading is the top-rated hospital per state.
  { id: "state-leaders", phrases: ["lead each state", "lead in each state", "leads each state"], base: `${BEST} by state`, reading: "Hospital Overall Rating, by state" },
  {
    id: "patient-experience",
    phrases: [
      "happy patients", "treated well", "bedside manner", "good service", "good experience",
      // 2,000 sweep (Batch D): how satisfied patients are overall is the Patient Experience ranking itself.
      "patients are treated well", "patients treated well", "happiest patients", "happiest patient feedback", "patients seem most satisfied",
      "patients are most satisfied", "patients most satisfied", "most satisfied patients", "satisfied with their care",
    ],
    base: "Show me hospitals with best Patient Experience",
    reading: "Patient Experience",
  },
  // --- a bare formal condition, Batch 5B-1: the pipeline needs a measure, the default is the condition's mortality ---
  {
    id: "stroke",
    phrases: ["stroke", "strokes"],
    base: STROKE,
    reading: "Stroke Mortality",
    alternates: [
      { label: "Heart Attack", base: AMI },
      { label: "Heart Failure", base: HF },
    ],
  },
  // 2,000 sweep (Batch C): a TIA is a warning stroke CMS does not measure on its own; stroke mortality is the closest measure.
  {
    id: "tia",
    phrases: ["tia", "tias", "mini stroke", "mini strokes", "transient ischemic attack", "transient ischemic attacks"],
    base: STROKE,
    reading: "Stroke Mortality",
    note: "CMS does not measure '{heard}' on its own; showing stroke mortality, the closest measure it publishes.",
  },
  // 2,000 sweep (Batch C): whole-hospital survival. Better survival is a LOWER hospital-wide mortality rate, so the best-first
  // wordings map to "lowest" and the worst-first ones (their own phrases: "worst" is a blocker outside a phrase) to "highest".
  {
    id: "hospital-wide-survival",
    phrases: [
      "overall survival", "patient survival overall", "patient survival", "survive best", "people survive best",
      "overall mortality", "overall hospital mortality", "risk adjusted overall mortality", "overall death rate", "overall death rates",
    ],
    base: HOSPITAL_WIDE_MORTALITY,
    reading: "Hospital-Wide Mortality",
    note: SURVIVAL_NOTE,
  },
  {
    id: "hospital-wide-survival-worst",
    phrases: ["worst overall survival", "worst patient survival", "worst patient survival overall", "lowest overall survival", "worst overall mortality"],
    base: HOSPITAL_WIDE_MORTALITY_WORST,
    reading: "Hospital-Wide Mortality, highest first",
    note: SURVIVAL_NOTE,
  },
  // --- ownership as a plain synonym ---
  // 2,000 sweep (Batch E): "best maternity hospital in Texas" has no measure the engine ranks with the flag, so it failed
  // and the model answered the plain overall rating (the maternity ask dropped). The flag's list is ordered by rating.
  {
    id: "birthing",
    phrases: [
      "maternity hospital", "maternity hospitals", "labor and delivery hospital", "labor and delivery hospitals",
    ],
    base: "Show me birthing-friendly hospitals",
    reading: "hospitals with the CMS Birthing-Friendly designation",
  },
  { id: "government-owned", phrases: ["government owned", "government run", "state run", "publicly owned"], base: "Show me government hospitals", reading: "Government hospitals", silent: true },
  // Batch 5B-1: a bare or typed ownership sub-label with nothing else in the question ("chruch owned", corrected to
  // "church owned" by SPELLINGS above) is rewritten deterministically, the same shape as government-owned - the
  // engine's own first pass already resolves these phrases with no rewrite when they are typed correctly (the
  // ownership-directory map, not this file, is what answers "physician owned hospitals in Texas"); this is the
  // fallback for a typo or for the phrase alone with no other words.
  { id: "church-owned", phrases: ["church owned", "church affiliated"], base: "Show me church-owned hospitals", reading: "Church-owned hospitals", silent: true },
  { id: "physician-owned", phrases: ["physician owned"], base: "Show me physician-owned hospitals", reading: "Physician-owned hospitals", silent: true },
  { id: "tribal-owned", phrases: ["tribal owned", "tribal"], base: "Show me tribal hospitals", reading: "Tribal hospitals", silent: true },
  { id: "department-of-defense", phrases: ["department of defense", "dod"], base: "Show me military hospitals", reading: "Department of Defense hospitals", silent: true },
  // D5: "military" needs its own note (not silent) - it maps to Department of Defense only, and VA hospitals are a
  // separate ownership category, so a user who meant VA should be told the mapping rather than get a silent one.
  {
    id: "military-owned",
    phrases: ["military owned", "military"],
    base: "Show me military hospitals",
    reading: "Department of Defense hospitals",
    note: "\"Military\" hospitals for '{heard}' means Department of Defense ownership (32 facilities). VA hospitals are tracked separately - ask for \"veterans hospitals\" for those.",
  },
  // --- Batch 5B-2: patient safety indicators ---
  // D1: casual "sepsis"/"sepsis rate" is read as the postoperative sepsis rate (PSI_13), the only sepsis measure
  // the warehouse has. "sepsis mortality"/"sepsis survival"/"sepsis recovery" are NOT registered here (or anywhere):
  // BLOCKERS already ("mortality") or a higher-is-better word never aliased ("survival", "recovery" - see
  // mortality-rate.ts) keep them off this deterministic path, and they stay refused (capability-catalog.ts).
  { id: "sepsis-rate", phrases: ["sepsis", "sepsis rate", "sepsis rates"], base: PSI_SEPSIS, reading: "Postoperative Sepsis Rate" },
  // D2: a bare mention of the metric itself, with nothing to rank, defaults to the PSI 90 composite.
  {
    id: "psi-bare",
    phrases: ["patient safety indicator", "patient safety indicators", "psi", "safety indicator", "safety indicators"],
    base: PSI_COMPOSITE,
    reading: "the PSI 90 Patient Safety Composite",
  },
  { id: "psi-90", phrases: withScoreWords(["psi 90", "psi 90 composite", "patient safety composite"]).concat([
    // 2,000 sweep (Batch D): the composite is the adverse-event measure; the model answered the overall rating for it.
    "adverse event rate", "adverse event rates", "lowest adverse event rate", "fewest adverse events",
  ]), base: PSI_COMPOSITE, reading: "the PSI 90 Patient Safety Composite" },
  // 2,000 sweep (Batch D): the indicator's registered alias (aliases/psi.ts); "rate" would otherwise stop the mapper.
  {
    id: "failure-to-rescue",
    phrases: ["failure to rescue", "failure to rescue rate", "failure to rescue rates"],
    base: PSI_FAILURE_TO_RESCUE,
    reading: "Death After Serious Surgical Complication (failure to rescue) Rate",
  },
  { id: "pressure-ulcer", phrases: ["pressure ulcer", "pressure ulcers", "bedsore", "bedsores"], base: PSI_PRESSURE_ULCER, reading: "Pressure Ulcer Rate" },
  {
    id: "fall-with-fracture",
    phrases: ["in-hospital fall with fracture", "in-hospital falls with fracture", "fall with fracture", "falls with fracture"],
    base: PSI_FALL_FRACTURE,
    reading: "In-Hospital Fall With Fracture Rate",
  },
  {
    id: "kidney-injury",
    phrases: ["postoperative acute kidney injury", "postoperative kidney injury", "kidney injury requiring dialysis", "postoperative kidney injury requiring dialysis"],
    base: PSI_KIDNEY_INJURY,
    reading: "Postoperative Acute Kidney Injury Rate",
  },
  {
    id: "blood-clot",
    phrases: [
      "perioperative blood clot", "blood clot after surgery", "blood clots after surgery",
      // 2,000 sweep (Batch D): the model wrote "fewest DVTs after surgery" as failure to rescue (PSI_04).
      "dvt after surgery", "dvts after surgery", "fewest dvts after surgery", "fewest dvts",
    ],
    base: PSI_BLOOD_CLOT,
    reading: "Perioperative Blood Clot Rate",
  },
  // --- Batch 5B-3: patient-survey (HCAHPS) dimensions ---
  {
    id: "survey-cleanliness",
    phrases: withScoreWords(["cleanliness", "room and bathroom cleanliness", "hospital room and bathroom cleanliness"]).concat([
      "cleanest", "clean rooms", "cleanest rooms", "cleanest room",
      // 2,000 sweep (Batch C)
      "clean bathrooms", "clean bathroom", "cleanest bathrooms", "cleanest bathroom", "clean hospital", "clean hospitals", "spotless rooms", "spotless room",
    ]),
    base: SURVEY_CLEAN,
    reading: "the Cleanliness patient-survey score",
  },
  // D9: "sanitary" is not the survey's own word, so the reading is said out loud.
  {
    id: "survey-sanitary",
    phrases: ["sanitary", "most sanitary"],
    base: SURVEY_CLEAN,
    reading: "the Cleanliness patient-survey score",
    note: "Read '{heard}' as the Cleanliness patient-survey score (how often patients said their room and bathroom were kept clean).",
  },
  {
    id: "survey-quietness",
    phrases: withScoreWords(["quietness"]).concat([
      "quietest", "quiet at night", "quietest at night", "quietest hospitals at night", "can actually sleep", "actually sleep", "sleep quality",
      "where you can sleep", // 2,000 sweep (Batch C)
    ]),
    base: SURVEY_QUIET,
    reading: "the Quietness patient-survey score",
  },
  // 2,000 sweep (Batch C): worst first. "worst"/"lowest" are blockers outside a phrase, so each worst-first wording is its own phrase.
  { id: "survey-quietness-worst", phrases: ["loudest", "loudest at night", "noisiest", "noisiest at night"], base: SURVEY_WORST("Quietness"), reading: "the Quietness patient-survey score, lowest first" },
  // Batch 5B-4: the bare words are the short answers to the D4 clarification ("Nurse, doctor or medicine communication?"):
  // a reply of "nurse" arrives as a question of its own, with no pending interaction to carry the word "communication".
  // The note says how it was read. "doctors" (plural) stays a pre-check topic (prices or individual doctors).
  {
    id: "survey-nurse",
    phrases: withScoreWords(["nurse communication", "nurses communication", "communication with nurses"]).concat(["nurse", "nurses", "nurses explain things", "nurses explain things well"]),
    base: SURVEY_NURSE,
    reading: "the Nurse Communication patient-survey score",
  },
  // 2,000 sweep (Batch B1): "doctor owned hospitals" is an ownership (ownership-directory.ts), not this score.
  { id: "survey-doctor", phrases: withScoreWords(["doctor communication"]).concat(["doctor"]), base: SURVEY_DOCTOR, reading: "the Doctor Communication patient-survey score", notFollowedBy: ["owned", "run"] },
  {
    id: "survey-medicines",
    phrases: withScoreWords(["communication about medicines", "communication about medicine", "medicine communication"]).concat([
      "medicine", "medicines",
      // 2,000 sweep (Batch C): the survey item asks whether staff explained what a new medicine is for and its side effects.
      "explain new medications", "explaining new medications", "explain new medications well", "explain new medicines", "explaining new medicines",
      "side effects explained", "explain side effects", "explaining side effects", "new medications explained",
    ]),
    base: SURVEY_MEDICINES,
    reading: "the Communication About Medicines patient-survey score",
  },
  {
    id: "survey-discharge",
    phrases: withScoreWords(["discharge information", "discharge instructions", "instructions for going home"]),
    base: SURVEY_DISCHARGE,
    reading: "the Discharge Information patient-survey score",
  },
  // "would recommend" alone is not a phrase: "I would recommend a hospital near Dallas" is a request, not this dimension.
  {
    id: "survey-recommend",
    phrases: [
      "patients would recommend", "patient would recommend", "would definitely recommend", "recommend the hospital", "most recommended",
      // 2,000 sweep (Batch C)
      "people recommend", "patients recommend", "recommended by patients", "most recommended by patients",
    ],
    base: SURVEY_RECOMMEND,
    reading: "the share of patients who would recommend the hospital (patient survey)",
  },
  { id: "survey-recommend-worst", phrases: ["least recommended"], base: SURVEY_WORST("Recommend Hospital"), reading: "the share of patients who would recommend the hospital, lowest first" },
  {
    id: "survey-overall",
    phrases: withScoreWords(["overall survey rating", "patient rating of the hospital"]).concat([
      // 2,000 sweep (Batch C): how patients rate the hospital overall is this survey item, not the CMS star rating.
      "patients rate highest overall", "patients rate highest", "rate highest overall", "rated highest by patients", "highest rated by patients",
    ]),
    base: SURVEY_OVERALL,
    reading: "the Overall Survey Rating patients gave the hospital",
  },
  {
    id: "survey-overall-worst",
    phrases: ["patients rate lowest overall", "patients rate lowest", "rate lowest overall", "lowest patient rating", "worst patient rating"],
    base: SURVEY_WORST("Overall Survey Rating"),
    reading: "the Overall Survey Rating patients gave the hospital, lowest first",
  },
  {
    id: "survey-star",
    phrases: [
      "patient survey star rating", "patient survey star ratings", "patient experience star rating", "patient experience star ratings",
      "survey star rating", "survey star ratings", "hcahps star rating", "hcahps star ratings", "summary star rating", "survey summary star",
    ],
    base: SURVEY_STAR,
    reading: "the patient-survey summary star rating",
  },
];

// ------------------------------------------------------------------------------------------------ filler

/** Dropped without comment: the request's scaffolding. */
export const SCAFFOLD: readonly string[] = [
  // "s": the possessive of a narrated relative ("my wife's heart checkup"); without it the lone letter kept the phrase from being read
  "please", "pls", "kindly", "hey", "hi", "hello", "can", "could", "would", "will", "you", "your", "i", "im", "ive", "s", "me", "my", "we",
  "our", "us", "show", "tell", "give", "find", "get", "list", "need", "want", "wanna", "looking", "look", "help", "for", "the", "a", "an",
  "is", "are", "am", "was", "be", "to", "go", "do", "does", "what", "whats", "which", "where", "who", "how", "there", "that", "this",
  "with", "of", "about", "any", "some", "best", "good", "great", "top", "better", "hospital", "hospitals", "place", "places", "should",
  // Batch 5B-4: "facility" is how the data names a hospital ("non-profit facilities"), never a topic of its own.
  "facility", "facilities",
  // 2,000 sweep (Batch C): the tails of "I'm", "we're", "I'd", "you'll", "I've" (like "s" above); "nationwide" names no
  // place to filter by, which is what a question without a place already means.
  "m", "re", "d", "ll", "ve", "nationwide",
  // Batch D: like "my", "our" and "your" above ("most satisfied with their care").
  "their",
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
  // 2,000 sweep (Batch C): "my dad is a germaphobe, so ...", "will be in the hospital for a week, so ...".
  "germaphobe", "week",
  // Batch C: conversational openers ("sorry if this is a dumb question but", "ok so I'm trying to figure out", "can you do me a
  // favor and look up", "would you mind listing", "could you pull up ... thanks"): nothing measurable, dropped and reported.
  "sorry", "dumb", "question", "quick", "morning", "appreciate", "trying", "figure", "out", "wondering", "curious", "favor", "mind",
  "listing", "pull", "up", "yo", "u", "thanks", "thank", "keeps", "asking", "choosing",
  "so", "if", "it", "but", "brother", "sister", "uncle", "aunt", "neighbor", "cousin", "niece", "nephew", "law",
  "family", "has", "have", "had", "having", "get", "gets", "getting", "got", "feel", "feels", "feeling", "been", "being", "were", "trust", "trusted",
];

/** Dropped and reported; the health words next to a phrase are quoted with it, the narration is not. */
export const FILLER: readonly string[] = TOPICAL_FILLER;
export const NARRATION: readonly string[] = NARRATION_FILLER;

/** See LayVocabulary.slotWords; a multi-word entry ("for profit") is kept whole, whatever the scaffold list says about "for". */
export const SLOT_WORDS: readonly string[] = [
  "government", "gov", "govt", "nonprofit", "non profit", "not for profit", "for profit", "proprietary", "private", "public",
  "federal", "state", "local", "county", "city", "va", "veterans", "owned", "run", "and", "or",
  // 2,000 sweep (Batch B1): the ownership sub-labels' own words (ownership-directory.ts), so a mapped phrase keeps them.
  "tribal", "military", "catholic", "religious", "army", "navy", "federally", "faith based", "native american", "air force",
  "doctor owned", "doctor run", "physician owned", "physician run", "church owned", "hospital district", "district owned",
  "department of defense",
  // 2,000 sweep (Batch D): "DC" reaches the mapper expanded, and a dropped "of" left "District Columbia", which no step resolves.
  "district of columbia",
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
// Batch 5B-4: "facility"/"facilities" are structural ("highest Cleanliness scores among non-profit facilities" was refused on that
// word alone); they name the hospitals being asked about, never a topic.
export const HEALTHCARE_FILLER_WORDS: readonly string[] = [...TOPICAL_FILLER.filter((word) => !SYMPTOM_WORDS.has(word)), "facility", "facilities", "nationwide"];

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
const EMERGENCY_LIST = "Show me hospitals with emergency services";

/**
 * What to offer when the question names something the platform does not answer (the unsupported topics in
 * capability-catalog.ts). Every chip is dry-run validated by the runtime before it is shown, and by
 * scripts/verify-batch5a1-vocab.ts, so none can lead to a dead end.
 */
export const SCOPE_GUIDANCE: readonly ScopeGuidance[] = [
  // Batch 5B-1: stroke mortality and hospital-wide mortality are registered now; only their READMISSION and
  // COMPLICATION wording stays unsupported (the warehouse has no such measure for either), with the mortality
  // question offered as the closest match.
  { topics: ["stroke readmission", "stroke complications"], label: "stroke readmission or complications - only stroke mortality is tracked", chips: [STROKE, AMI, HF] },
  // Batch 5B-2: postoperative sepsis (PSI_13) and the 11 other PSIs are registered now; only sepsis wording that
  // implies a measure the warehouse does not have (a mortality or survival rate) stays unsupported.
  { topics: ["sepsis mortality", "sepsis survival", "sepsis recovery"], label: "a sepsis mortality or survival rate - only the postoperative sepsis rate is tracked", chips: [PSI_SEPSIS, SAFETY, MORTALITY] },
  {
    topics: ["hospital acquired infection", "hospital acquired infections", "psi 5", "psi 05", "psi 7", "psi 07"],
    label: "that specific safety measure",
    chips: [SAFETY, OVERALL, PSI_COMPOSITE],
  },
  { topics: ["hospital wide readmission"], label: "hospital-wide readmission - only hospital-wide mortality is tracked", chips: [HOSPITAL_WIDE_MORTALITY, MORTALITY, OVERALL] },
  // Batch 5B-3: the 8 survey dimensions and the summary star are registered now. What stays here has no data
  // (staff responsiveness H_COMP_3 and care transition H_COMP_7 have 0 rows) or is a single survey item rather than a
  // dimension (D3, deferred: "nurses listen carefully").
  {
    topics: ["staff responsiveness", "responsiveness", "care transition", "care transitions", "listen carefully"],
    label: "that patient-survey detail",
    chips: [SURVEY_NURSE, EXPERIENCE, SURVEY_CLEAN],
  },
  // Batch 5B-4: "emergency services" (the flag), birthing-friendly and the hospital types are registered now; only the
  // emergency-department measures no table holds (waits, volumes) stay here.
  {
    topics: ["emergency department", "ed wait", "ed waits", "er wait", "er waits", "wait time", "wait times", "volumes"],
    label: "emergency-room information",
    chips: [EMERGENCY_LIST, OVERALL, SAFETY],
  },
  { topics: ["since", "over time", "years ago", "time trend", "time trends"], label: "results over time (I only have the latest data)", chips: [OVERALL, MORTALITY, READMIT] },
  { topics: ["address", "phone number", "phone numbers", "telephone", "patient records"], label: "contact details or patient records", chips: [OVERALL, SAFETY, EXPERIENCE] },
  // Batch 5C: a region the platform has no concept of (it searches by state, county or city), a request for medical knowledge, and a
  // request for hospitals like another hospital. Each is refused before any model call, whatever else the question names.
  { topics: ["bay area"], label: "the Bay Area", chips: ["Show me best hospitals in California", "Show me hospitals with lowest Mortality Rate in California", "Show me hospitals with best Patient Experience in California"] },
  { topics: ["symptoms of", "symptom of"], label: "medical information such as symptoms", chips: [MORTALITY, OVERALL, SAFETY] },
  { topics: ["similar to"], label: "hospitals similar to another hospital", chips: [OVERALL, SAFETY, MORTALITY] },
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

/**
 * Batch 5B-4 (D4): the chips for the "which communication?" clarification. "communication" naming no nurses, doctors or
 * medicines gets exactly its three answers, not the generic pool (a random other state). Each is a formal question the
 * deterministic path answers ("<dimension> scores", like B030), so the runtime's dry run keeps it.
 */
const COMMUNICATION_CHOICES = ["Nurse communication scores", "Doctor communication scores", "Communication about medicines scores"];

export interface AmbiguousTerm {
  term: string;
  /** Words that make the term specific. */
  unless: readonly string[];
  /** The clarification asked instead of any answer. */
  reason: string;
  /** Batch E: matched only as typed ("AS" the code, never the word "as"). */
  caseSensitive?: boolean;
}

/**
 * 2,000 sweep (Batch D): a word that alone is ambiguous here. The prompt asks the model to clarify "communication"
 * naming no nurses, doctors or medicines, but a narrative around it ("my sister hates noisy wards - ... best on
 * communication") made it pick one; the orchestrator now asks whatever the model wrote (normalizer-hook.ts).
 */
const COMMUNICATION: AmbiguousTerm = {
  term: "communication",
  unless: ["nurse", "nurses", "doctor", "doctors", "medicine", "medicines", "medication", "medications"],
  reason: "Nurse, doctor or medicine communication?",
};

export const AMBIGUOUS_TERMS: readonly AmbiguousTerm[] = [
  COMMUNICATION,
  // 2,000 sweep (Batch E): "hospitals in AS" - the model read American Samoa; "AS" is also just the word "as".
  { term: "AS", unless: ["american samoa"], reason: "Did you mean American Samoa (AS)?", caseSensitive: true },
];

export function clarificationChips(question: string): readonly string[] | undefined {
  const padded = correctedWords(question);
  const { term, unless } = COMMUNICATION;

  return padded.includes(` ${term} `) && !unless.some((word) => padded.includes(` ${word} `)) ? COMMUNICATION_CHOICES : undefined;
}

/** One sentence naming everything the platform answers today; used by the graceful "I currently track ..." reply. */
export const COVERAGE_SUMMARY =
  // Batch 5B-1: stroke and hospital-wide mortality are registered, mortality only (no readmission measure exists for either).
  // Batch 5B-2: the patient safety indicators (pressure ulcers, falls, blood clots, postoperative sepsis and more).
  // Batch 5B-3: the patient-survey dimensions. Batch 5B-4: hospital types and the emergency-services / birthing-friendly flags.
  "heart attack, heart failure, pneumonia, COPD and bypass surgery mortality and readmission, stroke and hospital-wide mortality, patient safety indicators, hip and knee replacement complications, plus hospital ratings, safety, patient experience (including cleanliness, quietness and nurse and doctor communication), ownership, hospital type (children's, psychiatric, critical access and more) and emergency-services or birthing-friendly hospitals";
