# Rozvodňa

Home Assistant custom integration for registry administration. Target HA Core
2026.11. Keep the panel self-contained under custom_components/rozvodna/panel.
Use HA registry helpers on the event loop. Run SQLite work in the executor.
All commands need an HA administrator. Never edit HA registry storage files.
Keep commit preflight, durable journal, per-operation verification and explicit
recovery. Preserve stable registry identities and stored nulls. Run Python and
browser tests before shipping. Use a disposable HA instance for smoke tests.
