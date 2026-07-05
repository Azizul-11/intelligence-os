# Entity Registry SDK

## Overview

The Entity Registry allows a Domain Pack to expose the entities it supports.

The registry is domain-agnostic and does not contain business knowledge.

It provides a consistent interface that allows the IntelligenceOS Platform to discover entities without knowing anything about a specific industry.

---

## Responsibilities

- Register entity definitions
- Discover available entities
- Retrieve entity metadata
- Provide a consistent lookup API

---

## Design Principles

- Domain agnostic
- Platform first
- Strongly typed
- Extensible
- Runtime independent

---

## Examples

Healthcare Domain Pack

- Hospital
- Physician
- Department
- Patient

Education Domain Pack

- School
- District
- Teacher
- Student

Finance Domain Pack

- Company
- Account
- Portfolio

The platform interacts only with the registry and never with domain-specific implementations.