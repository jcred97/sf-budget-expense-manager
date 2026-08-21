# Project Structure

```text
sf-budget-expense-manager/
  AGENTS.md
  README.md
  agent-docs/
    api-rebrand.md
    repository-rename.md
  package.json
  sfdx-project.json
  jest.config.js
  eslint.config.js
  config/
    project-scratch-def.json
  manifest/
    empty-package.xml
    legacy-spendly-destructive.xml
    package.xml
    rebrand-deploy.xml
  force-app/main/default/
    applications/
      Budget_Expense_Manager.app-meta.xml
    classes/
      controller/
        BankController.cls
        ExpenseGroupBankOptionDto.cls
        BudgetController.cls
        BudgetDto.cls
        BudgetSaveRequest.cls
        ExpenseController.cls
      handler/
        BankTriggerHandler.cls
        BudgetTriggerHandler.cls
        ExpenseGroupBankTriggerHandler.cls
        ExpenseTriggerHandler.cls
        RecurringExpenseTriggerHandler.cls
        BudgetExpenseSettingsTriggerHandler.cls
      service/
        BankAssignmentValidator.cls
        BankService.cls
        BudgetService.cls
        ExpenseCommandService.cls
        ExpenseQueryService.cls
        RecurringExpenseBatch.cls
        RecurringExpenseCalculator.cls
        RecurringExpenseGenerator.cls
        RecurringExpenseScheduler.cls
        RecurringExpenseService.cls
        BudgetExpenseSettingsService.cls
      test/
        BankAssignmentValidatorTest.cls
        BankControllerTest.cls
        BankTriggerHandlerTest.cls
        BudgetControllerTest.cls
        BudgetTriggerHandlerTest.cls
        ExpenseGroupBankTriggerHandlerTest.cls
        RecurringExpenseTriggerHandlerTest.cls
        ExpenseControllerTest.cls
        RecurringExpenseBatchTest.cls
        RecurringExpenseCalculatorTest.cls
        RecurringExpenseSchedulerTest.cls
        RecurringExpenseServiceTest.cls
        BudgetExpenseSettingsServiceTest.cls
        BudgetExpenseSettingsTriggerHandlerTest.cls
    contentassets/
      budgetExpenseManagerLogo.asset
    flexipages/
      Budget_Expense_Manager_UtilityBar.flexipage-meta.xml
      Expense_Record_Page.flexipage-meta.xml
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
      budgetModal/
      budgetPanel/
      budgetExpenseSettings/
      expenseBarChart/
      expenseCsvExport/
      expenseDashboard/
      expenseDashboardViewModel/
      expenseFormatters/
      expenseList/
      expenseListViewModel/
      expenseModal/
      expenseSummaryCards/
      expenseTransforms/
      expenseTrendChart/
      expenseWorkspaceConfig/
      recurringExpenseModal/
      recurringExpenses/
      recurringExpenseTransforms/
      recurringExpenseViewModel/
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

The checkout directory, GitHub repository, Git remote, and Salesforce DX project identity now use `sf-budget-expense-manager`. See `agent-docs/repository-rename.md` for the completed repository-identity record.

`destructive/` is Git-ignored and is not currently present. The completed legacy cleanup used the reviewed manifests in `manifest/`; future destructive work still requires live-org verification and explicit approval.
