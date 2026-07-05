# Domain SDK Contracts

The Domain SDK defines the public contracts that every Domain Pack must implement.

The SDK is intentionally domain-agnostic.

It contains no Healthcare, Education, Finance, Climate, or other domain-specific knowledge.

Every Domain Pack exposes the same public interface through these contracts.

Current contracts include:

- DomainVersion
- DomainMetadata
- DomainCapability
- DomainConfiguration
- DomainManifest
- DomainPack