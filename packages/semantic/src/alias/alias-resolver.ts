import type { AliasResolutionResult } from "./alias-resolution-result";

export class AliasResolver {
  constructor(
    private readonly aliases: ReadonlyMap<string, string>,
  ) {}

  resolve(input: string): AliasResolutionResult {
    // const canonicalKey = this.aliases.get(input);
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