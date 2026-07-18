export interface SemanticRegistryData {
  readonly aliases: ReadonlyMap<string, string>;

  readonly metrics: ReadonlySet<string>;

  readonly entities: ReadonlySet<string>;

  readonly categories: ReadonlySet<string>;

  readonly relationships: ReadonlySet<string>;
  readonly dimensions: ReadonlySet<string>;
  readonly benchmarks: ReadonlySet<string>;


}