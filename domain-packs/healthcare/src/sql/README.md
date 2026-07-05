# Healthcare SQL Templates

## Purpose

This module defines deterministic SQL template metadata for the Healthcare Domain Pack.

The templates describe analytical queries that IntelligenceOS can execute after healthcare data has been processed into the analytics warehouse.

## Registered SQL Templates

- Hospital Overall Rating
- Mortality Rate
- Readmission Rate
- Emergency Department Visits
- Patient Experience
- Length of Stay

## Architecture

```
IntelligenceOS Core
        ↓
Analytics Engine
        ↓
SQL Template Registry
        ↓
Healthcare Domain Pack
        ↓
Healthcare SQL Templates
```

The Healthcare Domain Pack registers SQL template metadata only.

These templates are deterministic and reusable.

They do not execute SQL or connect to a database.