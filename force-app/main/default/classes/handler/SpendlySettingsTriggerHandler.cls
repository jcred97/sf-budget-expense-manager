/** Enforces the single-record invariant for global Spendly settings. */
public inherited sharing class SpendlySettingsTriggerHandler {
    private static final String SINGLETON_ERROR_MESSAGE = 'Only one Spendly Settings record can exist.';

    /**
     * Rejects inserts that would leave more than one Spendly settings record.
     *
     * @param settingsRecords Settings records in the current before-insert context.
     */
    public static void beforeInsert(List<Spendly_Settings__c> settingsRecords) {
        Boolean singletonWouldBeViolated = settingsRecords.size() > 1;

        if (!singletonWouldBeViolated) {
            List<Spendly_Settings__c> existingSettings = [
                SELECT Id
                FROM Spendly_Settings__c
                WITH USER_MODE
                LIMIT 1
            ];
            singletonWouldBeViolated = !existingSettings.isEmpty();
        }

        if (!singletonWouldBeViolated) {
            return;
        }

        for (Spendly_Settings__c settingsRecord : settingsRecords) {
            settingsRecord.addError(SINGLETON_ERROR_MESSAGE);
        }
    }
}
