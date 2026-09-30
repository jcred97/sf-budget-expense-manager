# Budget & Expense Manager Agent Instructions

Follow [repository Salesforce standards](docs/salesforce-standards.md). Consult shared standards at `F:\Salesforce\AGENTS.md` when available.

## Repo Context

Budget & Expense Manager is a Salesforce Lightning Web Components expense-management app. Users manage a hierarchy of `Expense_Group__c -> Category__c -> Expense__c`, with recurring expense automation and settings.

## Reference Docs

- `docs/project-overview.md` - product purpose, core hierarchy, and main app capabilities.
- `docs/project-structure.md` - repository layout and important metadata locations.
- `docs/architecture.md` - data model, Apex methods, app metadata, permissions, and flexipages.
- `docs/components.md` - LWC and Apex component responsibilities.
- `docs/key-patterns.md` - UI, filtering, modal, table, and export behavior.
- `docs/salesforce-standards.md` - Flow, Apex, SOQL, LWC, deploy, and Git standards.
- `docs/testing-and-tooling.md` - Apex/LWC tests, tooling, destructive deploy notes, and currency behavior.

## Local Notes

- Source API version: `65.0`.
- Currency behavior is PHP-focused; check `docs/testing-and-tooling.md` before changing formatting.
- Prioritize Salesforce Lightning/SLDS styling for UI work; use custom styling only when the standard Salesforce patterns cannot reasonably cover the experience.
- `docs/` is shared project documentation. Keep current guidance at its root, images in `docs/assets/`, and historical records in `docs/history/`. See [the documentation index](docs/README.md).
