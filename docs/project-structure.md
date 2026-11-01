# Project Structure

The inventory below originated with the 2026-09-30 source review and is a guide to repository organization, not an exhaustive generated listing. The November cleanup removed unused assets and completed migration manifests. See [testing and tooling](testing-and-tooling.md) for subsequent deployment and beta-package verification. Salesforce companion `*-meta.xml` files are omitted from the class and bundle listings for readability.

```text
sf-budget-expense-manager/
  AGENTS.md
  README.md
  docs/
    README.md
    getting-started.md
    review-findings.md
    architecture.md
    components.md
    key-patterns.md
    project-overview.md
    project-structure.md
    salesforce-standards.md
    testing-and-tooling.md
    assets/
      architecture.svg
    history/
      handover.md
      api-rebrand.md
      repository-rename.md
      verification-log.md
  package.json
  sfdx-project.json
  jest.config.js
  eslint.config.js
  config/
    project-scratch-def.json
  manifest/
    package.xml
  force-app/main/default/
    applications/
      Budget_Expense_Manager.app-meta.xml
    classes/
      async/
        RecurringExpenseBatch.cls
        RecurringExpenseScheduler.cls
      controller/
        BankController.cls
        BudgetController.cls
        CurrencyContextController.cls
        ExchangeRateController.cls
        ExpenseController.cls
        RecurringExpenseAutomationController.cls
        RecurringExpenseController.cls
        SettingsController.cls
      dto/
        BudgetDto.cls
        BudgetExpenseSettingsState.cls
        BudgetExpenseSettingsUpdateRequest.cls
        BudgetSaveRequest.cls
        CurrencyContextDto.cls
        ExpenseFilterRequest.cls
        ExpensePageRequest.cls
        ExpensePageDto.cls
        ExpenseGroupBankOptionDto.cls
        ExchangeRateQuoteDto.cls
        ExchangeRateRequest.cls
        MonthlyExpenseTotalDto.cls
        RecurringExpenseGenerationResult.cls
        RecurringExpenseOverviewDto.cls
        RecurringExpenseRowDto.cls
      handler/
        BankTriggerHandler.cls
        BudgetTriggerHandler.cls
        ExpenseGroupBankTriggerHandler.cls
        ExpenseTriggerHandler.cls
        RecurringExpenseTriggerHandler.cls
        BudgetExpenseSettingsTriggerHandler.cls
      service/
        BankAssignmentValidator.cls
        BudgetExpenseSettingsService.cls
        BudgetService.cls
        CurrencyContextService.cls
        ExpenseCommandService.cls
        ExpenseCurrencyService.cls
        ExpensePageService.cls
        ExpenseQueryService.cls
        ExchangeRateProvider.cls
        ExchangeRateService.cls
        FrankfurterExchangeRateProvider.cls
        OrganizationCurrencyProvider.cls
        RecurringExpenseCalculator.cls
        RecurringExpenseGenerator.cls
        RecurringExpenseService.cls
        SalesforceOrganizationCurrencyProvider.cls
      test/
        BankAssignmentValidatorTest.cls
        BankControllerTest.cls
        BankTriggerHandlerTest.cls
        BudgetControllerTest.cls
        BudgetTriggerHandlerTest.cls
        CurrencyContextServiceTest.cls
        ExpenseGroupBankTriggerHandlerTest.cls
        RecurringExpenseTriggerHandlerTest.cls
        ExpenseControllerTest.cls
        ExchangeRateControllerTest.cls
        ExpenseCurrencyServiceTest.cls
        ExpensePageServiceTest.cls
        RecurringExpenseBatchTest.cls
        RecurringExpenseCalculatorTest.cls
        RecurringExpenseSchedulerTest.cls
        RecurringExpenseServiceTest.cls
        BudgetExpenseSettingsServiceTest.cls
        BudgetExpenseSettingsTriggerHandlerTest.cls
    flexipages/
      Budget_Expense_Manager_UtilityBar.flexipage-meta.xml
      Expense_Record_Page.flexipage-meta.xml
    externalCredentials/
      Exchange_Rates_Public.externalCredential-meta.xml
    globalValueSets/
      Bank.globalValueSet-meta.xml
    layouts/
      Bank__c-Bank Layout.layout-meta.xml
      Category__c-Category Layout.layout-meta.xml
      Expense__c-Expense Layout.layout-meta.xml
      Expense_Group_Bank__c-Expense Group Bank Layout.layout-meta.xml
      Expense_Group__c-Expense Group Layout.layout-meta.xml
      Recurring_Expense__c-Recurring Expense Layout.layout-meta.xml
      Budget_Expense_Manager_Setting__c-Budget & Expense Manager Settings Layout.layout-meta.xml
    lwc/
      budgetExpenseManager/
      budgetHistory/
      budgetModal/
      budgetPanel/
      budgetExpenseSettings/
      expenseBarChart/
      expenseCsvExport/
      expenseDashboard/
      expenseDashboardViewModel/
      expenseCurrencyMath/
      expenseExchangeRateData/
      expenseErrorUtils/
      expenseFormatters/
      expenseList/
      expenseListViewModel/
      expenseModal/
      expenseMonthNavigator/
      expensePrintReport/
      expenseSummaryCards/
      expenseTransforms/
      expenseTrendChart/
      expenseWorkspaceConfig/
      expenseWorkspaceData/
      expenseWorkspaceViewModels/
      modalFocusUtils/
      recurringExpenseModal/
      recurringExpenses/
      recurringExpenseViewModel/
    namedCredentials/
      Exchange_Rates_API.namedCredential-meta.xml
    objects/
      Bank__c/
      Budget__c/
      Expense_Group_Bank__c/
      Expense_Group__c/
      Category__c/
      Expense__c/
      Recurring_Expense__c/
      Budget_Expense_Manager_Setting__c/
    permissionsets/
      Budget_Expense_Manager_Admin.permissionset-meta.xml
      Budget_Expense_Manager_All_Access.permissionset-meta.xml
      Budget_Expense_Manager_User.permissionset-meta.xml
    staticresources/
      RemoveDateFormatStyle.css
    tabs/
      Bank__c.tab-meta.xml
      Budget_Expense_Manager.tab-meta.xml
      Budget__c.tab-meta.xml
      Category__c.tab-meta.xml
      Expense__c.tab-meta.xml
      Expense_Group__c.tab-meta.xml
      Recurring_Expense__c.tab-meta.xml
      Budget_Expense_Manager_Settings.tab-meta.xml
    triggers/
      BankTrigger.trigger
      BudgetTrigger.trigger
      ExpenseGroupBankTrigger.trigger
      ExpenseTrigger.trigger
      RecurringExpenseTrigger.trigger
      BudgetExpenseSettingsTrigger.trigger
```

The checkout directory, GitHub repository, Git remote, and Salesforce DX project identity now use `sf-budget-expense-manager`. See `docs/history/repository-rename.md` for the completed repository-identity record.

## Inventory And Ownership

- 28 active LWC bundles; any empty directories are not active bundles. Screen ownership is now in `expenseDashboard`, `expenseList`, and `recurringExpenses`, with shared workspace context/lookups in `budgetExpenseManager`.
- Eight controllers, sixteen service/interface classes, fifteen DTOs, six trigger handlers, two async classes, and eighteen Apex test classes. `classes/selector/` has no active classes; simple group/category/Bank lookups are in controllers.
- Eight custom objects, six triggers, three permission sets, seven explicit layouts, eight tabs, and two flexipages.
- Ten Jest suites live in bundle-local `__tests__/` folders: `budgetExpenseManager`, `expenseDashboard`, `expenseList`, `recurringExpenses`, `expenseModal`, `expenseTransforms`, `expenseWorkspaceData`, `expenseCsvExport`, `recurringExpenseViewModel`, and `budgetExpenseSettings`. The original source review passed 66 tests across nine suites; the later settings suite added five passing tests. These are scoped results, not a new full-suite or live-org verification.
- `expenseWorkspaceData` supplies imperative read/report helpers; view-model builders are pure presentation modules. `expenseWorkspaceViewModels` memoizes dashboard/list builders only. There is no active Flow implementation or populated Aura bundle.
- Root tooling also includes `.husky/`, `.prettierrc`, `.prettierignore`, `.forceignore`, `.gitignore`, `code-analyzer.yml`, and the npm lockfile. These configure hooks, formatting, deployment exclusions, source control, and static analysis.

## Documentation And Deployment State

`docs/` is the shared project documentation home. Current guidance stays at its root, images in `docs/assets/`, and dated records in `docs/history/`. Root `AGENTS.md` contains operating instructions and links. See the [documentation index](README.md). See [architecture](architecture.md) for relationships, security, runtime flows, and the current open issues.
`manifest/package.xml` describes current deployable source. Completed rebrand/destructive manifests were removed from the checkout; their exact contents remain in Git history at `d7c749d`. Completion evidence remains in the historical records and testing notes. Removing a class, bundle, or asset from Git does not remove it from Salesforce or an installed package. Inspect the target before planning any separate destructive deployment.
`destructive/` is Git-ignored. Do not infer either successful deployment or successful metadata removal from the presence or absence of a local directory. Scheduled jobs, settings records, credential access, and permission-set assignments are runtime state outside this source inventory.
