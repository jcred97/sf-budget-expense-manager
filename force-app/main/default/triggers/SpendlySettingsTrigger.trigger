trigger SpendlySettingsTrigger on Spendly_Settings__c(before insert) {
    SpendlySettingsTriggerHandler.beforeInsert(Trigger.new);
}
