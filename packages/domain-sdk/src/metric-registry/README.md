# Metric Registry SDK

The Metric Registry SDK defines the contracts used by every
IntelligenceOS Domain Pack to describe, register, and expose
domain-specific metrics.

It provides a deterministic registry that allows the platform
to discover the metrics available within a Domain Pack without
embedding any domain knowledge inside the platform core.

This SDK contains **contracts only**.

It does **not** contain:

- Metric values
- Healthcare metrics
- Education metrics
- Finance metrics
- SQL templates
- Analytics logic
- AI prompts

Those belong inside individual Domain Packs.

---

## Purpose

The Metric Registry SDK enables every Domain Pack to publish
its available metrics through a consistent interface.

The platform interacts with registered metrics rather than
domain-specific implementations.

This allows IntelligenceOS to support any domain while keeping
the platform completely domain agnostic.

---

## Responsibilities

The Metric Registry defines contracts for:

- Metric Categories
- Metric Definitions
- Metric Registration
- Metric Registry
- Registry Context
- Registry Results

---

## Design Principles

The Metric Registry follows the core architecture principles of
IntelligenceOS:

- Platform first
- Domain agnostic
- Deterministic
- Strongly typed
- Extensible
- Independent of implementation

---

## Platform Usage

The Metric Registry is consumed by future platform components,
including:

- Domain Registry
- Semantic Layer
- Analytics Engine
- Orchestrator
- Conversation Pipeline
- Experience Platform

Each component discovers metrics through the registry rather
than hardcoded domain logic.

---

## Future Domain Packs

Every Domain Pack registers its own metrics using this SDK.

Examples include:

- Healthcare
- Education
- Finance
- Manufacturing
- Climate
- Retail
- Supply Chain

The platform never knows what metrics exist beforehand.

It simply loads a Domain Pack and discovers its registered
metrics through the Metric Registry.

---

## Architecture

```text
Domain Pack
      │
      ▼
Metric Registry SDK
      │
      ▼
Platform Core
      │
      ▼
Semantic Layer
      │
      ▼
Analytics Engine