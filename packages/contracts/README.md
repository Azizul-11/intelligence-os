# IntelligenceOS Platform Contracts

## Purpose

The `@intelligence/contracts` package defines the shared language of the
IntelligenceOS platform.

It contains the platform-wide TypeScript contracts that are used across
Frontend, Edge Functions, Analytics Engines, Domain SDKs, Semantic Layer,
Data Platform, and future services.

The goal of this package is to ensure every part of the platform speaks
the same vocabulary and shares the same data models.

This package contains **contracts only**.

It does not contain business logic, validation rules, database access,
or implementation details.

---

# Responsibilities

This package is responsible for defining the platform-wide contracts for:

- Entities
- Metrics
- Datasets
- Narratives
- Relationships
- Validation Results
- Normalization Results
- Warehouse Models
- Common Types
- Shared Enums
- Shared Result Types

Every contract should be domain-agnostic and reusable across multiple
industries (Healthcare, Education, Finance, Climate, Manufacturing, etc.).

---

# Public API

The package exposes shared platform contracts that may be imported by:

- Frontend Applications
- Supabase Edge Functions
- Data Platform
- Semantic Layer
- Domain SDKs
- Analytics Engine
- Intelligence Engines
- Conversation System
- Orchestrator
- Testing Utilities

Example:

```ts
import {
  Entity,
  Metric,
  Dataset,
  ValidationResult,
} from "@intelligence/contracts";
```

---

# Design Principles

All contracts should follow these principles:

- Platform-first
- Domain-agnostic
- Immutable where possible
- Strongly typed
- Backward compatible
- Free of implementation details

Contracts define **what the platform understands**, not **how it works**.

---

# Dependency Rules

This package sits at the bottom of the platform architecture.

It must never depend on:

- React
- Supabase
- PostgreSQL
- Edge Functions
- HTTP
- AI Providers
- Domain SDKs
- Business Logic

Other packages may depend on this package.

This package should depend only on TypeScript.

---

# Not Responsible For

This package must never contain:

- Database queries
- SQL
- Validation logic
- Normalization logic
- API calls
- HTTP handlers
- AI prompts
- LLM integrations
- Business rules
- Healthcare-specific models
- School-specific models
- File ingestion
- Parsing logic
- Logging

If code performs work, it does not belong here.

This package defines contracts only.

---

# Architecture Position

```text
                  Applications
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    Frontend      Edge Functions   Analytics
         │              │              │
         └──────────────┼──────────────┘
                        │
                @intelligence/contracts
                        │
                TypeScript Only
```

All platform layers communicate using these shared contracts.

This package is the canonical source of truth for the platform's data models.