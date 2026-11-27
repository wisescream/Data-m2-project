---
name: documentation-release
description: Keep FinLake setup, architecture, context, API contracts, data sources guide, and skills synchronized and reproducible.
---
# Documentation and Release Skill

## Mission
Ensure any engineer or reviewer can understand, start, test, and defend the entire FinLake repository using only its documentation.

## Canonical Documentation Set
- `README.md` : Quick start, stack overview, ports, and Windows PowerShell / Docker commands.
- `docs/CAHIER_DES_CHARGES.md` : Functional and technical specification.
- `docs/architecture.md` : Docker topology, Mermaid architecture diagram, MinIO storage layout, and polyglot flows.
- `docs/context.md` : Complete database taxonomy, architectural & design justifications, and trade-offs.
- `docs/api_contracts.md` : Exhaustive REST API contracts (headers, payloads, responses, status codes).
- `docs/data_sources_guide.md` : Step-by-step guide for adding and probing polyglot sources.
- `docs/benchmark_report.md` & `docs/quality_report.md` & `docs/iceberg_guide.md`.

## Rules
- Always quote Mermaid edge labels containing parentheses (e.g., `|"Keyset Pagination O(1)"|`) to prevent Mermaid parse errors.
- Document Windows PowerShell differences (use `;` instead of `&&` for chaining, `cmd /c "cd frontend && npm run build"` if PowerShell execution policy blocks `npm.ps1`).
- Keep `.env.example` synchronized with `docker-compose.yml`; never commit `.env`.
- Update `docs/api_contracts.md`, `docs/architecture.md`, `docs/context.md`, and the relevant `.agents/skills/*/SKILL.md` whenever code behavior changes.
