---
name: documentation-release
description: Keep FinLake setup, operations, data lineage, API, and benchmark documentation reproducible.
---
# Documentation and Release Skill

## Mission
Make the repository understandable and reproducible by another engineer.

## Required docs
README quick start, architecture diagram, dataset card/attribution, data dictionary, environment variables, API reference, storage layout, Trino SQL examples, benchmark methodology/results, limitations, and troubleshooting.

## Rules
- Document commands for Windows PowerShell and generic Docker-compatible shells where practical.
- Include `.env.example`, never real credentials.
- Pin or constrain dependency versions and record tested versions.
- Document ports, volumes, health checks, startup order, and expected readiness.
- Label synthetic timestamps and synthetic records clearly.
- Separate implemented features from planned features.
- Never invent benchmark results, dataset license terms, or production guarantees.
- Before completion, follow README from a clean checkout and verify each command.
## Definition of done
A reviewer can clone, configure, start, ingest a sample, query it in Trino, run tests, and reproduce benchmark results using only repository documentation.
