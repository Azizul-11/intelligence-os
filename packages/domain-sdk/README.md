# Domain SDK

## Overview

The Domain SDK defines the universal contract between the IntelligenceOS Platform and every Domain Pack.

IntelligenceOS itself contains no domain knowledge.

Instead, domain knowledge is provided through independently developed Domain Packs that implement the SDK contracts.

This architecture allows the platform to remain completely domain-agnostic while supporting multiple industries through reusable plugins.

---

## Purpose

The Domain SDK exists to answer one question:

> **How does a Domain Pack communicate with the IntelligenceOS Platform?**

Every Domain Pack—regardless of industry—implements the same public contracts.

The platform interacts only with these contracts and never with domain-specific implementations.

---

## Scope

This package contains **contracts only**.

It defines the public interfaces required to build a Domain Pack but intentionally contains no business knowledge or implementation.

Examples of what belongs in this package:

- Domain Manifest
- Domain Metadata
- Domain Version
- Domain Configuration
- Domain Capabilities
- Domain Pack Contract

Examples of what does **not** belong here:

- Healthcare metrics
- Hospital aliases
- Education ontologies
- Financial benchmarks
- SQL templates
- ETL pipelines
- AI prompts
- Business rules

Those belong inside individual Domain Packs.

---

## Architecture

```text
                IntelligenceOS Platform
                        │
                        │
                @intelligence/domain-sdk
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
 Healthcare Pack   Education Pack   Finance Pack
```

The platform depends only on the SDK.

It never depends on a specific domain.

---

## Responsibilities

The Domain SDK defines the contracts for:

- Domain Metadata
- Domain Manifest
- Domain Version
- Domain Configuration
- Domain Capabilities
- Domain Pack

These contracts establish a consistent API that every Domain Pack must implement.

---

## Design Principles

The Domain SDK follows the same principles as the rest of IntelligenceOS:

- Platform-first architecture
- Domain agnostic
- Strongly typed
- Deterministic
- Extensible
- Implementation independent
- Plugin-based

---

## Future Domain Packs

The SDK is designed to support any number of domains without modifying the platform.

Examples include:

- Healthcare
- Education
- Finance
- Manufacturing
- Climate
- Retail
- Supply Chain
- Government
- Logistics

Each Domain Pack provides its own knowledge while exposing the same SDK contracts.

---

## Relationship to the Platform

The SDK sits between the platform core and every domain implementation.

```text
Platform Core
      │
      ▼
Domain SDK
      │
      ▼
Domain Pack
      │
      ▼
Domain Knowledge
```

This separation ensures that IntelligenceOS remains a universal intelligence platform rather than an application tied to a single industry.

---

