# IntelligenceOS Data Platform

The Data Platform is responsible for ingesting, validating, transforming, and loading structured datasets into the IntelligenceOS Universal Warehouse.

Unlike Domain SDKs, this package contains **no healthcare-specific, education-specific, or finance-specific logic**.

Its responsibility is to provide a deterministic, reusable data pipeline that can process any supported structured dataset.

---

## Responsibilities

- Raw File Registry
- Dataset Registry
- Validation Engine
- Normalization Engine
- Entity Resolution
- Flattening Engine
- Warehouse Builder
- Pipeline Runner

---

## Architecture

```
Raw Files
     │
     ▼
Raw File Registry
     │
     ▼
Dataset Registry
     │
     ▼
Validation Engine
     │
     ▼
Normalization Engine
     │
     ▼
Entity Resolution
     │
     ▼
Flattening Engine
     │
     ▼
Warehouse Builder
     │
     ▼
Universal Warehouse
```

---

## Design Principles

- Platform-first
- Domain-agnostic
- Deterministic
- Strong typing
- Reusable
- Extensible

---

## Supported Domains

This package is intentionally domain independent.

Examples include:

- Healthcare
- Education
- Finance
- Climate
- Manufacturing
- Retail
- Government

Domain-specific behavior belongs inside Domain SDKs, **not** inside the Data Platform.

---

## Status

Phase 2 — Universal Data Platform