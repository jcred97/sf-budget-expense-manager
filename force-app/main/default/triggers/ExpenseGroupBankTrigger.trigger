trigger ExpenseGroupBankTrigger on Expense_Group_Bank__c(before insert, before update) {
    ExpenseGroupBankTriggerHandler.run(Trigger.operationType, Trigger.new, Trigger.oldMap);
}
