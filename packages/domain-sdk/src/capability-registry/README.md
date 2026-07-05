# Capability Registry

The Capability Registry defines the contracts for registering and
discovering capabilities provided by a Domain Pack.

A capability represents something a domain is able to perform,
such as comparison, ranking, benchmarking, filtering, reporting,
or visualization.

The Capability Registry is completely domain-agnostic.

It does **not** contain:

- Healthcare logic
- Education logic
- Finance logic
- SQL templates
- AI prompts
- Business rules
- Runtime implementation

Those belong inside individual Domain Packs.

---

## Responsibilities

The Capability Registry defines contracts for:

- Capability Definition
- Capability Registration
- Registry Context
- Registry Result
- Capability Registry Interface

---

## Design Principles

The Capability Registry follows the IntelligenceOS architecture:

- Platform first
- Domain agnostic
- Strongly typed
- Deterministic
- Extensible
- Contracts only

---

## Examples

A Domain Pack may register capabilities such as:

- Compare Entities
- Rank Entities
- Benchmark Metrics
- Trend Analysis
- Geographic Filtering
- Report Generation

The platform only understands capabilities.

It never understands healthcare, education, finance, or any other domain.