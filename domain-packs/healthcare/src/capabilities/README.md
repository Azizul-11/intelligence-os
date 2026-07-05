# Healthcare Capabilities

## Purpose

This module defines the capabilities exposed by the Healthcare Domain Pack.

Capabilities describe what the Healthcare Domain Pack is able to perform.
They provide metadata that allows the IntelligenceOS Platform to discover
supported analytical operations without embedding healthcare-specific logic
into the platform.

## Registered Capabilities

- Compare Hospitals
- Rank Hospitals
- Benchmark Analysis
- Trend Analysis
- County Comparison

## Architecture

IntelligenceOS Core
    ↓
Domain SDK Platform
    ↓
Healthcare Domain Pack
    ↓
Healthcare Capability Definitions

Capabilities contain metadata only.

They do not implement analytics, SQL execution, business rules, or AI behavior.
Those responsibilities belong to higher platform layers.