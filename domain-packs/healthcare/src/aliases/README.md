# Healthcare Aliases

## Purpose

This module defines healthcare-specific aliases used by the Healthcare Domain Pack.

Aliases normalize common abbreviations, synonyms, and alternate terminology into canonical concepts understood by the IntelligenceOS platform.

## Registered Aliases

- Acute Myocardial Infarction (AMI / Heart Attack)
- Emergency Department (ED / ER)
- Centers for Medicare & Medicaid Services (CMS)
- Hospital Consumer Assessment of Healthcare Providers and Systems (HCAHPS)
- Hospital Overall Rating
- Readmission Rate

## Architecture

IntelligenceOS Core
        ↓
Domain SDK Platform
        ↓
Healthcare Domain Pack
        ↓
Healthcare Alias Definitions

Aliases improve semantic understanding while keeping the IntelligenceOS core completely domain-agnostic.