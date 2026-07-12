# Semantic Contracts

## Overview

The Semantic contracts define the canonical language of IntelligenceOS.

Unlike the Domain SDK, which allows individual domains to describe their own
entities, metrics, aliases, and relationships, the Semantic contracts represent
the normalized platform vocabulary stored inside the Semantic Registry.

Every Domain Pack is translated into these contracts before being persisted.

```
Domain Pack
      ↓
Domain SDK
      ↓
Semantic Contracts
      ↓
Semantic Registry
```

The Semantic Layer allows every IntelligenceOS engine to reason about concepts
instead of physical database tables.

---

## Responsibilities

- Define canonical entities
- Define canonical metrics
- Define canonical dimensions
- Define canonical categories
- Define canonical aliases
- Define canonical benchmarks
- Define canonical relationships

---

## Design Principles

- Platform first
- Domain agnostic
- Deterministic
- Strongly typed
- Immutable contracts

---

## Future

Future platform engines such as the Semantic Resolver, Query Planner,
Recommendation Engine, Knowledge Graph, and Ontology Engine will all depend on
these contracts.