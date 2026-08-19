trigger BankTrigger on Bank__c(before insert, before update) {
    BankTriggerHandler.run(Trigger.operationType, Trigger.new, Trigger.oldMap);
}
