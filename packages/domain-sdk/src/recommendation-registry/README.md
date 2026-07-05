# Recommendation Registry

The Recommendation Registry defines the contracts for registering
and discovering recommendations exposed by a Domain Pack.

A recommendation represents an optional action, suggestion, or
guidance that can be presented by the platform based on domain
capabilities.

The Recommendation Registry is completely domain-agnostic.

It does **not** contain:

- Healthcare logic
- Education logic
- Finance logic
- AI prompts
- SQL templates
- Runtime implementation

Those belong inside individual Domain Packs.

---

## Responsibilities

The Recommendation Registry defines contracts for:

- Recommendation Definition
- Recommendation Registration
- Registry Context
- Registry Result
- Recommendation Registry Interface

---

## Design Principles

The Recommendation Registry follows the IntelligenceOS architecture:

- Platform first
- Domain agnostic
- Strongly typed
- Deterministic
- Extensible
- Contracts only

---

## Examples

Examples of recommendations include:

- Compare similar entities
- Review benchmark performance
- Explore related metrics
- Investigate anomalies
- View supporting evidence

The platform understands recommendations as generic capabilities,
never as domain-specific behavior.