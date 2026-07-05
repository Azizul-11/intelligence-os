# Healthcare Relationships

## Purpose

This module defines the core relationships between healthcare entities exposed by the Healthcare Domain Pack.

These relationship definitions provide structural domain knowledge to IntelligenceOS through the Domain SDK. They describe how healthcare concepts are connected without containing runtime logic or implementation details.

## Registered Relationships

- Hospital → Department
- Department → Hospital
- Provider → Department
- Hospital → Metric
- County → Hospital
- CMS Facility → Hospital

## Architecture

```
IntelligenceOS Core
        ↓
Domain SDK Platform
        ↓
Healthcare Domain Pack
        ↓
Healthcare Relationship Definitions
```

The IntelligenceOS platform remains domain-agnostic.

The Healthcare Domain Pack contributes healthcare-specific knowledge by defining how healthcare entities relate to one another using the reusable Relationship SDK contracts.