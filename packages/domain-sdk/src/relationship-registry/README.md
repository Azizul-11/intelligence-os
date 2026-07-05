# Relationship Registry

The Relationship Registry defines how a Domain Pack describes relationships
between entities, metrics, and other domain concepts.

It provides a universal contract for representing domain knowledge without
embedding domain-specific logic into the IntelligenceOS platform.

---

## Responsibilities

The Relationship Registry defines contracts for:

- Relationship Definitions
- Relationship Registration
- Relationship Types
- Relationship Cardinality
- Registry Context
- Registry Results

---

## Design Principles

The Relationship Registry follows the core principles of IntelligenceOS:

- Platform First
- Domain Agnostic
- Deterministic
- Strongly Typed
- Extensible
- Independent of Implementation

---

## Examples

Healthcare

Hospital
→ contains
Department

Education

District
→ contains
School

Finance

Company
→ reports
Revenue

Climate

Weather Station
→ measures
Temperature

These examples illustrate how different domains express relationships using
the same SDK contracts.

The platform understands relationships, not healthcare, education,
finance, or climate.

---

Every Domain Pack implements these contracts while the IntelligenceOS core
remains completely domain independent.