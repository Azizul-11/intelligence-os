# Healthcare Benchmarks

## Purpose

This module defines benchmark metadata used by the Healthcare Domain Pack.

Benchmark definitions describe how healthcare metrics can be interpreted
against reference points such as national averages, state averages, peer
groups, and industry standards.

These files provide metadata only. They do not calculate benchmark values.

---

## Registered Benchmarks

- National Average
- State Average
- Top Decile
- Median
- Hospital Star Rating

---

## Architecture

```
IntelligenceOS Core
        ↓
Domain SDK Platform
        ↓
Healthcare Domain Pack
        ↓
Healthcare Benchmark Definitions
```

The IntelligenceOS platform remains domain-agnostic.

The Healthcare Domain Pack supplies healthcare benchmark knowledge by
implementing the reusable Benchmark SDK.