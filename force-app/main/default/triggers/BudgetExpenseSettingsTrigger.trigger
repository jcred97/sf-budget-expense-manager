trigger BudgetExpenseSettingsTrigger on Budget_Expense_Manager_Setting__c(before insert) {
    BudgetExpenseSettingsTriggerHandler.beforeInsert(Trigger.new);
}
