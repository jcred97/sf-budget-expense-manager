# Bank Payment Methods

Payment-method capabilities belong to `Expense_Group_Bank__c`, not the shared `Bank__c` catalog. Each group can configure Credit Card, Debit Card, Bank Payment, and Bank Transfer independently for its Bank assignment. Cash always remains available and defaults for new Expenses and recurring templates.

New assignments default all four checkboxes to enabled. Uncheck methods that the group does not use. The Expense and Recurring Expense dialogs show Cash plus the selected assignment's enabled methods. Changing the Bank resets an unsupported selection to Cash. Existing saved types remain available when editing the same record and Bank; duplicates must meet the current configuration.

Apex enforces the same configuration on new records, payment-method or Bank changes, and recurring reactivation. Unrelated historical edits remain possible. The legacy Bank picklist fallback remains compatible during migration. Generation from an existing active no-Bank/noncash template can retain its original type only when the new Expense's source, Category, type, and empty Bank values match that persisted template. This exception does not permit ordinary new noncash Expenses without a Bank. Change or deactivate active recurring templates before disabling a method they use. Disabling a method does not rewrite historical expenses.

## First Rollout To An Existing Org

Checkbox defaults apply to new records; do not rely on them to initialize existing Bank assignments. Use a staged rollout so scheduled generation cannot encounter uninitialized capabilities:

1. Capture the IDs of all existing `Expense_Group_Bank__c` records before adding the fields. Retain this baseline outside Git. Coordinate assignment creation/configuration during the rollout.
2. Validate and deploy only the four `Supported_*__c` checkbox fields, their field permissions, and the assignment layout first. Keep the old validation and dialogs active for this stage.
3. Read the captured assignments' four values and save a backup. Initialize all four to true for those captured IDs only, preserving their existing supported choices. Verify every captured ID. Do not run a blanket initialization again after users start configuring methods; it would overwrite their choices.
4. Validate and deploy the new selector, validator/handler, Cash picklist defaults, and LWC bundles together. Include their Apex tests and any shared payment-method LWC module. Run Bank and recurring-generation tests, and confirm the supplied permission sets can read the capability fields.
5. Verify an assignment with a restricted configuration in both forms, Cash with no Bank, an unchanged historical expense, and an active recurring template. Then let users customize their assignment checkboxes.

The feature's source and a check-only deployment do not initialize live records. Any commit, push, deployment, and production-data initialization require the repository's normal authorization. Keep existing recurring jobs running during the field initialization stage; if Salesforce blocks an Apex deployment because of pending jobs, follow the scheduler deployment guidance in `testing-and-tooling.md` rather than aborting jobs automatically.
