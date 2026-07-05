# Healthcare Entities

## Purpose

This module defines the core healthcare entities exposed by the Healthcare Domain Pack.

These entity definitions provide domain knowledge to IntelligenceOS through the Domain SDK. They do not contain runtime data or business logic.

## Registered Entities

- Hospital
- Provider
- Department
- County
- State
- CMS Facility

## Architecture

IntelligenceOS Core
    ↓
Domain SDK Platform
    ↓
Healthcare Domain Pack
    ↓
Healthcare Entity Definitions

The platform remains domain-agnostic. The Healthcare Domain Pack supplies healthcare-specific knowledge without modifying the IntelligenceOS core.