// Same-org, unpackaged rebrand migration.
// Copies the one legacy settings record into the renamed settings object.
// Safe to rerun: an existing destination singleton is updated only when values differ.

List<Spendly_Settings__c> legacySettingsRecords = [
    SELECT
        Name,
        Recurring_Expenses_Enabled__c,
        Global_Recurring_Run_Time__c,
        Last_Recurring_Run_DateTime__c,
        Last_Recurring_Run_Status__c,
        Last_Recurring_Run_Message__c
    FROM Spendly_Settings__c
    ORDER BY CreatedDate ASC
];
System.assertEquals(
    1,
    legacySettingsRecords.size(),
    'Expected exactly one legacy Spendly settings record. No changes were made.'
);

List<Budget_Expense_Manager_Setting__c> destinationSettingsRecords = [
    SELECT
        Id,
        Name,
        Recurring_Expenses_Enabled__c,
        Global_Recurring_Run_Time__c,
        Last_Recurring_Run_DateTime__c,
        Last_Recurring_Run_Status__c,
        Last_Recurring_Run_Message__c
    FROM Budget_Expense_Manager_Setting__c
    ORDER BY CreatedDate ASC
];
System.assert(
    destinationSettingsRecords.size() <= 1,
    'Found more than one Budget & Expense Manager settings record. No changes were made.'
);

Spendly_Settings__c legacySettings = legacySettingsRecords[0];
Budget_Expense_Manager_Setting__c destinationSettings;

if (destinationSettingsRecords.isEmpty()) {
    destinationSettings = new Budget_Expense_Manager_Setting__c();
} else {
    destinationSettings = destinationSettingsRecords[0];
}

Boolean settingsAlreadyMatch =
    destinationSettings.Id != null &&
    destinationSettings.Name == legacySettings.Name &&
    destinationSettings.Recurring_Expenses_Enabled__c ==
    legacySettings.Recurring_Expenses_Enabled__c &&
    destinationSettings.Global_Recurring_Run_Time__c ==
    legacySettings.Global_Recurring_Run_Time__c &&
    destinationSettings.Last_Recurring_Run_DateTime__c ==
    legacySettings.Last_Recurring_Run_DateTime__c &&
    destinationSettings.Last_Recurring_Run_Status__c ==
    legacySettings.Last_Recurring_Run_Status__c &&
    destinationSettings.Last_Recurring_Run_Message__c ==
    legacySettings.Last_Recurring_Run_Message__c;

if (settingsAlreadyMatch) {
    System.debug(LoggingLevel.INFO, 'Settings migration already complete; no DML was required.');
} else {
    destinationSettings.Name = legacySettings.Name;
    destinationSettings.Recurring_Expenses_Enabled__c = legacySettings.Recurring_Expenses_Enabled__c;
    destinationSettings.Global_Recurring_Run_Time__c = legacySettings.Global_Recurring_Run_Time__c;
    destinationSettings.Last_Recurring_Run_DateTime__c = legacySettings.Last_Recurring_Run_DateTime__c;
    destinationSettings.Last_Recurring_Run_Status__c = legacySettings.Last_Recurring_Run_Status__c;
    destinationSettings.Last_Recurring_Run_Message__c = legacySettings.Last_Recurring_Run_Message__c;

    if (destinationSettings.Id == null) {
        insert destinationSettings;
        System.debug(LoggingLevel.INFO, 'Created the renamed settings singleton.');
    } else {
        update destinationSettings;
        System.debug(LoggingLevel.INFO, 'Updated the renamed settings singleton.');
    }
}
