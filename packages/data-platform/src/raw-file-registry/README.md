# Raw File Registry

## Purpose

The Raw File Registry is the entry point of the IntelligenceOS Universal Data Platform.

Its responsibility is to track every file entering the platform before any validation, normalization, or transformation occurs.

The registry does **not** inspect file contents.

Instead, it records metadata that allows the platform to identify, version, and manage datasets throughout the ingestion lifecycle.

---

## Responsibilities

- Register incoming files
- Generate unique file identifiers
- Track checksums
- Track storage locations
- Track file versions
- Record upload metadata

---

## Non-Responsibilities

The Raw File Registry does **not**:

- Parse CSV files
- Parse Excel files
- Parse JSON files
- Validate schemas
- Normalize fields
- Resolve entities
- Build warehouse tables

Those responsibilities belong to later phases of the Data Platform.

---

## Architecture

External File

↓

Raw File Registry

↓

File Metadata

↓

Dataset Registry

---

## Supported File Types

The registry is file-format agnostic.

Examples include:

- CSV
- JSON
- Excel
- Parquet
- XML
- ZIP

Support for reading these formats is implemented elsewhere in the platform.

---

## Status

Phase 2.1 — Raw File Registry