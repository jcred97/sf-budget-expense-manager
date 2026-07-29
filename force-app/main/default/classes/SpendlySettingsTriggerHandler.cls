public inherited sharing class SpendlySettingsTriggerHandler {
    private static final String SINGLETON_ERROR_MESSAGE = 'Only one Spendly Settings record can exist.';

    public static void beforeInsert(List<Spendly_Settings__c> settingsRecords) {
        Boolean singletonWouldBeViolated =
            settingsRecords.size() > 1 ||
            [SELECT COUNT() FROM Spendly_Settings__c] > 0;

        if (!singletonWouldBeViolated) {
            return;
        }

        for (Spendly_Settings__c settingsRecord : settingsRecords) {
            settingsRecord.addError(SINGLETON_ERROR_MESSAGE);
        }
    }
}
