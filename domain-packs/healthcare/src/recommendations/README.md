# Healthcare Recommendations

## Purpose

This module defines the recommendations exposed by the Healthcare Domain Pack.

Recommendations describe suggested analytical follow-up actions that can be
presented by the IntelligenceOS Platform. They provide metadata only and do
not contain business rules, SQL execution, or AI logic.

## Registered Recommendations

- Investigate Mortality
- Compare with Peers
- Review Readmission
- Analyze Patient Experience
- Investigate Length of Stay

## Architecture

IntelligenceOS Core
    ↓
Domain SDK Platform
    ↓
Healthcare Domain Pack
    ↓
Healthcare Recommendation Definitions

Recommendations are metadata only.

They guide higher platform layers but do not implement runtime behavior.