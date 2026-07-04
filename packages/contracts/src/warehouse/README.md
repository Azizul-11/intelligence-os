# Warehouse Module

## Purpose

Defines the canonical warehouse contracts used by IntelligenceOS.

The warehouse is the normalized intelligence layer where every supported
domain (Healthcare, Education, Finance, Manufacturing, Climate, etc.)
is represented using a common structure.

## Responsibilities

- Define warehouse entities
- Define warehouse metrics
- Define warehouse narratives
- Provide the canonical warehouse model shared across the platform

## Public API

- WarehouseEntity
- WarehouseMetric
- WarehouseNarrative

## Not Responsible For

- ETL implementation
- Database access
- SQL generation
- Analytics
- Business logic