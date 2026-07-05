# Healthcare Metrics

## Purpose

This module defines the core healthcare metrics provided by the Healthcare Domain Pack.

These metric definitions implement the Metric Registry SDK and provide reusable healthcare domain knowledge without introducing platform-specific logic.

## Registered Metrics

- Hospital Overall Rating
- Mortality Rate
- Readmission Rate
- Emergency Department Visits
- Patient Experience
- Length of Stay

## Architecture

IntelligenceOS Core
    ↓
Domain SDK Platform
    ↓
Healthcare Domain Pack
    ↓
Healthcare Metric Definitions

The IntelligenceOS platform remains domain-agnostic. The Healthcare Domain Pack supplies healthcare-specific metric definitions through the reusable Domain SDK.