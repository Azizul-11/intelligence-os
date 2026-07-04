# Entity Resolution

## Purpose

The Entity Resolution Engine identifies records that represent the same real-world entity.

It does **not** merge records.

It does **not** modify datasets.

It simply discovers deterministic relationships between entity candidates.

## Responsibilities

- Candidate discovery
- Match scoring
- Entity resolution
- Resolution reporting

## Non-Responsibilities

- Data normalization
- Data validation
- Warehouse loading
- Domain-specific matching logic

Healthcare, education, finance, manufacturing, and other domain-specific matching strategies belong to their respective Domain SDKs.