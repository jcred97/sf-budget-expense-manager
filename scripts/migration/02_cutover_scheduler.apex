// Same-org scheduler cutover for the unpackaged API rebrand.
// Initial run: validates the legacy job, aborts it, and schedules the renamed class.
// Successful rerun: validates the completed cutover and performs no mutation.

String legacyScheduleName = 'Spendly Recurring Expense Daily';
String destinationScheduleName = 'Budget Expense Manager Recurring Daily';
String expectedCronExpression = '0 0 8 * * ?';
Time expectedRunTime = Time.newInstance(8, 0, 0, 0);
Set<String> terminalScheduleStates = new Set<String>{ 'COMPLETE', 'DELETED' };

List<Budget_Expense_Manager_Setting__c> destinationSettingsRecords = [
    SELECT Global_Recurring_Run_Time__c
    FROM Budget_Expense_Manager_Setting__c
];
System.assertEquals(
    1,
    destinationSettingsRecords.size(),
    'Run 01_copy_settings.apex first. Expected exactly one renamed settings record.'
);
Time configuredRunTime = destinationSettingsRecords[0].Global_Recurring_Run_Time__c;
System.assert(
    configuredRunTime == null || configuredRunTime == expectedRunTime,
    'The renamed settings record is not configured for 08:00. No scheduler changes were made.'
);

List<CronTrigger> activeLegacyJobs = [
    SELECT Id, CronExpression, OwnerId, State, TimeZoneSidKey
    FROM CronTrigger
    WHERE CronJobDetail.Name = :legacyScheduleName AND State NOT IN :terminalScheduleStates
];
List<CronTrigger> activeDestinationJobs = [
    SELECT Id, CronExpression, OwnerId, State, TimeZoneSidKey
    FROM CronTrigger
    WHERE CronJobDetail.Name = :destinationScheduleName AND State NOT IN :terminalScheduleStates
];

if (activeLegacyJobs.isEmpty()) {
    System.assertEquals(
        1,
        activeDestinationJobs.size(),
        'No active legacy job exists, so exactly one completed destination cutover was expected.'
    );
    CronTrigger existingDestinationJob = activeDestinationJobs[0];
    System.assertEquals(
        'WAITING',
        existingDestinationJob.State,
        'The existing destination schedule is not in WAITING state.'
    );
    System.assertEquals(
        expectedCronExpression,
        existingDestinationJob.CronExpression,
        'The existing destination schedule does not use the expected 08:00 cron expression.'
    );
    System.debug(
        LoggingLevel.INFO,
        'Scheduler cutover already complete; no scheduler changes were required.'
    );
} else {
    System.assertEquals(
        1,
        activeLegacyJobs.size(),
        'Expected exactly one active legacy schedule. No scheduler changes were made.'
    );
    CronTrigger legacyJob = activeLegacyJobs[0];
    System.assertEquals(
        'WAITING',
        legacyJob.State,
        'The legacy schedule must be in WAITING state before cutover.'
    );
    System.assertEquals(
        expectedCronExpression,
        legacyJob.CronExpression,
        'The legacy schedule does not use the expected 08:00 cron expression.'
    );
    System.assertEquals(
        0,
        activeDestinationJobs.size(),
        'An active destination schedule already exists. No scheduler changes were made.'
    );
    System.assertEquals(
        legacyJob.OwnerId,
        UserInfo.getUserId(),
        'Run the cutover as the legacy scheduled-job owner so execution context is preserved.'
    );
    System.assertEquals(
        legacyJob.TimeZoneSidKey,
        UserInfo.getTimeZone().getID(),
        'Run the cutover in the legacy scheduled-job timezone so the 08:00 schedule is preserved.'
    );

    System.abortJob(legacyJob.Id);
    Id destinationJobId = System.schedule(
        destinationScheduleName,
        expectedCronExpression,
        new RecurringExpenseScheduler()
    );
    System.debug(LoggingLevel.INFO, 'Scheduler cutover completed successfully.');
}
