# Pipeline Runner

## Purpose

The Pipeline Runner orchestrates the complete Universal Data Platform workflow.

It coordinates every pipeline stage without implementing domain-specific logic.

## Pipeline

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

## Responsibilities

- Execute stages in order
- Track pipeline execution
- Collect execution reports
- Return final pipeline status

## Non-Responsibilities

- Validation logic
- Normalization logic
- Entity matching
- Flattening
- Warehouse persistence

This module is universal and domain-independent.