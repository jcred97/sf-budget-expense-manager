trigger ExpenseTrigger on Expense__c(before insert, before update) {
    ExpenseTriggerHandler.run(Trigger.operationType, Trigger.new, Trigger.oldMap);
}
