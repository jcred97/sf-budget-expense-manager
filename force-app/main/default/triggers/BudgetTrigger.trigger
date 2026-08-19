trigger BudgetTrigger on Budget__c(before insert, before update) {
    BudgetTriggerHandler.beforeSave(Trigger.new);
}
