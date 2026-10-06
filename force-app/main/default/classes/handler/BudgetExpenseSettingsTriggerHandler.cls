/** Enforces the single-record invariant for global Budget & Expense Manager settings. */
public inherited sharing class BudgetExpenseSettingsTriggerHandler {
    private static final String SINGLETON_ERROR_MESSAGE = 'Only one Budget & Expense Manager settings record can exist.';

    /**
     * Rejects inserts that would leave more than one settings record.
     *
     * @param settingsRecords Settings records in the current before-insert context.
     */
    public static void beforeInsert(List<Budget_Expense_Manager_Setting__c> settingsRecords) {
        for (Budget_Expense_Manager_Setting__c settings : settingsRecords) {
            // The database unique key also serializes otherwise simultaneous first inserts.
            settings.Singleton_Key__c = 'Default';
        }
        Boolean singletonWouldBeViolated = settingsRecords.size() > 1;

        if (!singletonWouldBeViolated) {
            List<Budget_Expense_Manager_Setting__c> existingSettings = [
                SELECT Id
                FROM Budget_Expense_Manager_Setting__c
                WITH USER_MODE
                LIMIT 1
            ];
            singletonWouldBeViolated = !existingSettings.isEmpty();
        }

        if (!singletonWouldBeViolated) {
            return;
        }

        for (Budget_Expense_Manager_Setting__c settingsRecord : settingsRecords) {
            settingsRecord.addError(SINGLETON_ERROR_MESSAGE);
        }
    }
}
