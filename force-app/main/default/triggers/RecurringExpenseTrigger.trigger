trigger RecurringExpenseTrigger on Recurring_Expense__c(before insert, before update) {
    RecurringExpenseTriggerHandler.run(Trigger.operationType, Trigger.new, Trigger.oldMap);
}
