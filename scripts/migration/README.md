# Same-Org Unpackaged Rebrand Migration and Cleanup

These anonymous-Apex scripts validate the deployed, same-org API rebrand and its legacy cleanup without changing shared business records.

The business objects retain their original APIs: `Expense_Group__c`, `Category__c`, `Recurring_Expense__c`, and `Expense__c`. A same-org unpackaged deployment therefore continues to use the existing records directly; those records must not be copied. Only the renamed settings singleton and scheduler require a cutover.

## Historical Initial Cutover Preconditions

These conditions applied to the already-completed scripts 1-4 cutover. The legacy object and job no longer exist after the approved cleanup; use script 5 for current-state verification.

- The rebranded metadata and Apex classes have already been deployed successfully.
- The legacy `Spendly_Settings__c` object and scheduler metadata still exist.
- Run with an administrator that can query and update both settings objects and manage scheduled Apex.
- Run the scheduler cutover as the owner of the legacy scheduled job, with the same user timezone.
- Confirm the legacy schedule is in `WAITING` state and uses `0 0 8 * * ?`.
- Do not open or save the new settings UI between deployment and the settings-copy step; the service can create a default destination record. The copy script safely updates one such record if it already exists.

## Historical Cutover Run Order

The completed cutover used these commands explicitly against `mainDevOrg`:

```powershell
sf apex run --target-org mainDevOrg --file scripts/migration/01_copy_settings.apex
sf apex run --target-org mainDevOrg --file scripts/migration/02_cutover_scheduler.apex
sf apex run --target-org mainDevOrg --file scripts/migration/03_verify_rebrand.apex
sf apex run --target-org mainDevOrg --file scripts/migration/04_smoke_read_endpoints.apex
```

The first script requires exactly one legacy settings record and at most one destination record. It copies `Name` plus all five application settings fields and performs no DML when the records already match.

The second script validates all scheduler conditions before aborting anything. Its first successful run aborts exactly one legacy `WAITING` job and schedules `RecurringExpenseScheduler` as `Budget Expense Manager Recurring Daily` with the preserved `0 0 8 * * ?` cron expression. A rerun validates the already-completed state and is a no-op.

The third script is read-only. It compares every migrated settings value, verifies zero active legacy jobs and exactly one valid renamed job, and reports counts for the unchanged business-record objects.

The fourth script is read-only. It invokes the LWC-facing Apex endpoints as the current user and verifies that the rebranded application can read the complete existing dataset, settings singleton, and renamed scheduler state.

Scripts 1 and 3 intentionally reference `Spendly_Settings__c` and no longer compile after that legacy object was removed. Script 2 is now an unnecessary verification-only no-op because cutover is complete.

## Current Read-Only Verification

Scripts 4 and 5 remain usable against the current org:

```powershell
sf apex run --target-org mainDevOrg --file scripts/migration/04_smoke_read_endpoints.apex
sf apex run --target-org mainDevOrg --file scripts/migration/05_verify_post_cleanup.apex
```

The fifth script verifies the current settings singleton and permission assignment, exactly one valid renamed schedule, the shared record counts and required relationships, and the 23 retained recurring-template links.

## Completed Cleanup

On 2026-08-15, the legacy settings row was exported to the Git-ignored `scripts/migration/backups/legacy-spendly-2026-08-15/` directory before deletion. Check-only deployment `0AfgK00000QSD8ESAX` and cleanup deployment `0AfgK00000QSI4fSAH` each passed 42/42 deletion actions and 52/52 focused tests. Cleanup used [legacy-spendly-destructive.xml](../../manifest/legacy-spendly-destructive.xml), did not purge deleted metadata, and preserved all neutral business objects and records.

## Safeguards

- Any missing, duplicate, unexpected, differently timed, or concurrently running job causes an assertion before scheduler mutation.
- A mismatched scheduler owner or timezone causes an assertion before the legacy job is aborted.
- Scripts 1-4 do not delete legacy settings, metadata, permission assignments, or business data. Cleanup was performed separately with the reviewed destructive manifest after backup and approval.
- The scripts do not copy the neutral-API business records, preventing duplicate expenses.
- For future destructive work, do not deploy until the relevant read-only verification and application smoke tests pass and the user explicitly approves the exact cleanup scope.
