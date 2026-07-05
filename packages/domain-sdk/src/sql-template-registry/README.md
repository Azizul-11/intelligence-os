# SQL Template Registry

The SQL Template Registry defines the universal contracts for
registering deterministic SQL templates within a Domain Pack.

A SQL Template represents an executable analytical query that can
be invoked by the IntelligenceOS Platform.

The registry contains metadata only.

It does not execute SQL.

---

## Responsibilities

The SQL Template Registry defines contracts for:

- SQL Template Definitions
- SQL Template Parameters
- SQL Template Registration
- SQL Template Registry
- Registry Context
- Registry Result
- SQL Template Types

---

## Design Principles

The SQL Template Registry is:

- Domain agnostic
- Deterministic
- Strongly typed
- Extensible
- Independent of implementation

---

## Examples

Healthcare

- Top Hospitals by Mortality
- Readmission Rate by State
- Average Length of Stay

Education

- Graduation Rate by District
- Attendance Trend
- School Ranking

Finance

- Quarterly Revenue
- Operating Margin
- Profit Trend

Manufacturing

- Defect Rate
- Production Yield
- Machine Downtime

The platform never understands the SQL itself.

It only understands SQL Template Definitions provided by a Domain Pack.