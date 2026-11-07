# Changelog

## Unreleased

- Let the LLM select Chinese or English game skills from the conversation. Expose four localized entries, retain `/eu4` and `/hoi4` as language-neutral user entry points, and stop using the legacy `language` setting to choose content.

- Add complete DSH management for EU4/HOI4 engine, rules, game/mod discovery, immutable indexes, imports, diagnostics, background tasks and session defaults.
- Reuse eu4-indexer as a pinned Git submodule, with additive generic management and upstream query-session APIs.
- Add scoped official MCP clients, generated bilingual game skills, authenticated owner-only management RPC, browser UI and local packaging/tests.

- Upstream feature source: `1b9a8ad` on the local management branch.
