# Benchmark Registry

The Benchmark Registry defines the universal contracts for
registering benchmark definitions within a Domain Pack.

A benchmark describes how a metric should be evaluated against
a reference point such as national averages, state averages,
peer groups, industry standards, or custom thresholds.

The registry contains metadata only.

It does not calculate benchmark values.

---

## Responsibilities

The Benchmark Registry defines contracts for:

- Benchmark Definitions
- Benchmark Registration
- Benchmark Registry
- Registry Context
- Registry Result
- Benchmark Types
- Benchmark Classifications

---

## Design Principles

The Benchmark Registry is:

- Domain agnostic
- Deterministic
- Strongly typed
- Extensible
- Independent of implementation

---

## Examples

Healthcare

- Hospital Mortality Rate
- Readmission Rate
- Average Length of Stay

Education

- Graduation Rate
- Attendance Rate
- Reading Proficiency

Finance

- Profit Margin
- Return on Investment
- Operating Cost Ratio

Manufacturing

- Defect Rate
- Downtime
- Yield

The platform never understands these benchmarks directly.

It only understands Benchmark Definitions provided by a Domain Pack.