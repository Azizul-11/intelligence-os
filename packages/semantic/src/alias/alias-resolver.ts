import type { AliasResolutionResult } from "./alias-resolution-result";

export class AliasResolver {
  constructor(private readonly aliases: ReadonlyMap<string, string>) {}

  resolve(input: string): AliasResolutionResult {
    // const canonicalKey = this.aliases.get(input);

    console.log("========== ALIAS DEBUG ==========");
    console.log(
      "Contains 'overall rating':",
      this.aliases.has("overall rating"),
    );

    console.log(
      "Contains 'highest rated hospitals':",
      this.aliases.has("highest rated hospitals"),
    );

    const canonicalKey = this.aliases.get(input);

    console.log("AliasResolver");
    console.log("Input:", input);
    console.log("Canonical:", canonicalKey);

    if (!canonicalKey) {
      return {
        matched: false,
        canonicalKey: null,
        alias: null,
      };
    }

    return {
      matched: true,
      canonicalKey,
      alias: input,
    };
  }
}
