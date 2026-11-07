# Changelog

## Unreleased

- Update the engine's pinned upstream, pin HOI4 rules to `297dd69c`, and expose new doctrine relationships, modifier templates, naval-hook event lists and expression-aware effect analysis through DSH's existing MCP bridge. Recheck CWTools/EU4 pins, regenerate both HOI4 skill translations and include dependency feature coverage in the package.

- Let the LLM select Chinese or English game skills from the conversation. Expose four localized entries, retain `/eu4` and `/hoi4` as language-neutral user entry points, and stop using the legacy `language` setting to choose content.

- Add complete DSH management for EU4/HOI4 engine, rules, game/mod discovery, immutable indexes, imports, diagnostics, background tasks and session defaults.
- Reuse eu4-indexer as a pinned Git submodule, with additive generic management and upstream query-session APIs.
- Add scoped official MCP clients, generated bilingual game skills, authenticated owner-only management RPC, browser UI and local packaging/tests.

- Upstream feature source: `1b9a8ad` on the local management branch.
