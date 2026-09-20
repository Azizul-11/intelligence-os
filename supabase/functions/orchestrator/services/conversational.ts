/**
 * LLM Integration Layer 0 classifier (Batch 1, Step 1.1): pure and dependency-free so
 * it can be unit-tested under tsx as well as run in the Deno edge function.
 *
 * A message is conversational only when the WHOLE utterance is a greeting, a
 * meta/capability question, or thanks / goodbye - optionally a greeting followed by a
 * meta question ("hey what can you help me with?"), with trailing punctuation and a few
 * politeness words. The previous patterns matched a PREFIX (`^(hi|...)\b`, `^(help|...)\b`),
 * so any request that merely started with such a word was swallowed and answered with the
 * onboarding text instead of reaching the pipeline: "hi show me hospitals in HI",
 * "help me find the safest hospitals in Texas", "what is this hospital's rating".
 * Those are analytical requests and must fall through.
 */
const GREETING = "(?:hi|hello|hey|hiya|howdy|greetings|yo)(?:\\s+(?:there|everyone|everybody|all|team|folks|again))?";

const META =
  "(?:what can you do|what do you do|capabilities|help(?: me)?|what is this|who are you|what are you|" +
  "what can you (?:help|assist) (?:me )?with|how (?:are|do) you work|explain (?:yourself|what you can do))" +
  "(?:\\s+(?:for me|please|here|today))?";

const THANKS = "(?:thanks|thank you|thankyou|thx)(?:\\s+(?:so much|very much|a lot|a ton))?(?:[,!.\\s]+that was (?:very |really )?(?:helpful|great|good|useful|awesome))?";

const BYE = "(?:bye|goodbye|good bye|see you)";

const CONVERSATIONAL = new RegExp(`^(?:${GREETING}[\\s,!.]*)?(?:${META}|${THANKS}|${BYE})?$`);

export function isConversational(question: string): boolean {
  const trimmed = question.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 60) {
    return false;
  }
  const core = trimmed.replace(/[\s!.?]+$/, "");
  // Punctuation only ("???") is not a greeting: both groups of the pattern are optional, so guard the empty case.
  return core.length > 0 && CONVERSATIONAL.test(core);
}

/**
 * Batch 4: questions that cannot be answered as typed and are better asked
 * about than run, with 0 SQL. Returns the clarifying question, or undefined
 * when the question should go on to the pipeline. Exact literal patterns only.
 *
 * - A question that opens with a follow-up phrase ("what about Ohio?", "and
 *   how about hip and knee readmissions?") only means something relative to an
 *   earlier answer. A request that reaches here has no pending clarification
 *   to continue and the service keeps no memory of earlier answers, so running
 *   it as a fresh question would silently answer a different one (a nationwide
 *   ranking for "what about hip and knee readmissions?").
 * - "top 0 hospitals": an empty list is never what was meant.
 */
export function preflightClarification(question: string): string | undefined {
  const text = question.trim();

  if (/^(?:and\s+)?(?:what|how)\s+about\b/i.test(text)) {
    return "That reads like a follow-up to an earlier question, but I don't keep the context of previous answers. Could you ask the whole question in one message?";
  }

  if (/\b(?:top|bottom|first|last)\s+0+\b/i.test(text)) {
    return "A list of zero hospitals would be empty. How many would you like to see?";
  }

  return undefined;
}
