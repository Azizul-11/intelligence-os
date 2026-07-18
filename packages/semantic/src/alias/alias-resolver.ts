import type { AliasResolutionResult } from "./alias-resolution-result";

export class AliasResolver {
  resolve(
    input: string,
    aliases: ReadonlyMap<string, string>,
  ): AliasResolutionResult {
    const canonicalKey = aliases.get(input);

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