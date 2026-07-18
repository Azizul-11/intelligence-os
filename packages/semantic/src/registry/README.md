# Semantic Registry

## Purpose

The Semantic Registry is the runtime representation of the platform's canonical semantic knowledge.

It provides immutable, deterministic access to semantic definitions loaded from a Domain SDK or another registry source.

The Semantic Engine never owns semantic knowledge.

Instead, it consumes the registry through read-only lookup APIs.

---

## Responsibilities

The registry exposes canonical semantic concepts including:

- Aliases
- Metrics
- Entities
- Categories
- Relationships

The registry is intentionally read-only.

It performs no normalization, matching, inference, or business logic.

---

## Design Principles

- Immutable
- Deterministic
- Domain-independent
- No database logic
- No loading logic
- No caching
- No AI
- No inference

The registry is simply the runtime representation of semantic knowledge.

---

## Current Architecture

Domain SDK

↓

Semantic Loader

↓

Semantic Registry

↓

Semantic Engine


---

## Future Responsibilities

Future versions may be populated from:

- Supabase Semantic Registry
- Local JSON snapshots
- Cached registry bundles
- Test fixtures

The Semantic Engine should remain unchanged regardless of the registry source.

---

## Status

Current implementation provides immutable access to:

- Alias Registry
- Metric Registry
- Entity Registry
- Category Registry
- Relationship Registry

Benchmark support and additional semantic resources will be added incrementally as the platform evolves.