import type {
  EntityProvider,
  EntityResolutionResult,
} from "@intelligence/domain-sdk";

export class EntityResolver {
  constructor(
    private readonly provider: EntityProvider,
  ) {}

  resolve(
    phrase: string,
  ): EntityResolutionResult {
    return this.provider.resolve(phrase);
  }
}