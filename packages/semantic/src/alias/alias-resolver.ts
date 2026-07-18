import type { AliasResolutionResult } from "./alias-resolution-result";

export class AliasResolver {
  constructor(
    private readonly aliases: ReadonlyMap<string, string>,
  ) {}

  resolve(input: string): AliasResolutionResult {
    const canonicalKey = this.aliases.get(input);

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