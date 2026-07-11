# Hospital General Information

## Status

Planned (Phase 3.11)

## Source

Centers for Medicare & Medicaid Services (CMS)

Dataset:
Hospital General Information

## Purpose

Provides the canonical list of healthcare facilities and their core descriptive information.

This dataset serves as the first vertical slice for the IntelligenceOS ETL pipeline.

## Primary Entities

- Hospital
- CMS Facility
- County
- State

## Primary Metrics

- Hospital Overall Rating
- Mortality
- Safety
- Readmission
- Patient Experience
- Timely & Effective Care

## Pipeline

Raw File
↓

Raw File Registry
↓

Dataset Registry
↓

Validation Engine
↓

Normalization Engine
↓

Entity Resolution
↓

Flattening Engine
↓

Warehouse Builder
↓

Healthcare Domain Pack
↓

Verification




## Canonical Field Mapping

| CMS Column | IntelligenceOS Entity | Canonical Field |
|------------|-----------------------|-----------------|
| Facility ID | CMS Facility | facilityId |
| Facility Name | Hospital | name |
| Address | Hospital | address |
| City/Town | Hospital | city |
| State | State | stateCode |
| ZIP Code | Hospital | zipCode |
| County/Parish | County | countyName |
| Telephone Number | Hospital | phone |
| Hospital Type | Hospital | type |
| Hospital Ownership | Hospital | ownership |
| Emergency Services | Hospital | emergencyServices |
| Meets criteria for birthing friendly designation | Hospital | birthingFriendly |