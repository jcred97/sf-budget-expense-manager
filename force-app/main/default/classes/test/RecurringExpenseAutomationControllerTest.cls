@IsTest
private class RecurringExpenseAutomationControllerTest {
    @IsTest
    static void testTracksTheSubmittedJobThroughCompletion() {
        Test.startTest();
        Id jobId = RecurringExpenseAutomationController.runDueExpensesBatch();
        RecurringExpenseRunStatus queued = RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
        System.assertEquals(jobId, queued.jobId);
        System.assertEquals(false, queued.isTerminal, 'A newly submitted batch is still pending.');
        System.assert(new Set<String>{ 'Holding', 'Queued', 'Preparing', 'Processing' }.contains(queued.status));
        Test.stopTest();

        RecurringExpenseRunStatus completed = RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
        System.assertEquals(jobId, completed.jobId, 'Read the submitted job rather than global settings.');
        System.assertEquals('Completed', completed.status);
        System.assertEquals(true, completed.isTerminal);
        System.assertEquals(0, completed.numberOfErrors);
        System.assertEquals(completed.totalJobItems, completed.jobItemsProcessed);
        System.assertEquals(true, completed.outcomeAvailable);
        System.assertEquals(false, completed.hasCatchUpRemaining);
    }

    @IsTest
    static void testUnavailableInputsReturnTheSameMessage() {
        assertUnavailable(null);
        Expense_Group__c groupRecord = new Expense_Group__c(Name = 'Wrong object');
        insert groupRecord;
        assertUnavailable(groupRecord.Id);
    }

    @IsTest
    static void testJobOutcomeIgnoresOtherRunsAndMissingLegacyOutcome() {
        Test.startTest();
        Id jobId = Database.executeBatch(new RecurringExpenseBatch(), 1);
        Test.stopTest();
        Recurring_Expense_Run__c ownOutcome = [
            SELECT Id, Has_Catch_Up_Remaining__c
            FROM Recurring_Expense_Run__c
            WHERE Job_Id__c = :String.valueOf(jobId)
        ];
        ownOutcome.Has_Catch_Up_Remaining__c = true;
        update ownOutcome;
        BudgetExpenseSettingsService.markRecurringRunCompleted(1, 1);
        insert new Recurring_Expense_Run__c(Job_Id__c = 'another-run', Has_Catch_Up_Remaining__c = false);
        RecurringExpenseRunStatus status = RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
        System.assertEquals(true, status.outcomeAvailable);
        System.assertEquals(true, status.hasCatchUpRemaining, 'A newer singleton summary or another job must not hide this job cap.');
        delete ownOutcome;
        status = RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
        System.assertEquals(false, status.outcomeAvailable, 'Older jobs without a durable outcome have an unknown catch-up result.');
        System.assertEquals(false, status.hasCatchUpRemaining);
    }

    @IsTest
    static void testAnotherUserCannotReadTheSubmittedJob() {
        User otherUser = new User(
            Alias = 'runother',
            Email = 'recurring.other@example.invalid',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Recurring Run Reader',
            LanguageLocaleKey = 'en_US',
            LocaleSidKey = 'en_US',
            ProfileId = UserInfo.getProfileId(),
            TimeZoneSidKey = 'Asia/Manila',
            Username = 'recurring.other.' + UserInfo.getOrganizationId() + '.' + DateTime.now().getTime() + '@example.invalid'
        );
        insert otherUser;
        Test.startTest();
        Id jobId = Database.executeBatch(new RecurringExpenseBatch(), 1);
        System.runAs(otherUser) {
            assertUnavailable(jobId);
        }
        Test.stopTest();
        System.assertEquals(1, [SELECT COUNT() FROM Recurring_Expense_Run__c WHERE Job_Id__c = :String.valueOf(jobId)]);
        System.runAs(otherUser) {
            assertUnavailable(jobId);
        }
    }

    @IsTest
    static void testMapsActiveAndTerminalStatesIncludingPartialErrors() {
        for (String status : new List<String>{ 'Holding', 'Queued', 'Preparing', 'Processing', 'Completed', 'Failed', 'Aborted' }) {
            RecurringExpenseRunStatus result = RecurringExpenseAutomationController.statusForJob(
                snapshot(UserInfo.getUserId(), 'BatchApex', 'RecurringExpenseBatch', status, 2)
            );
            System.assertEquals(status, result.status);
            System.assertEquals(new Set<String>{ 'Completed', 'Failed', 'Aborted' }.contains(status), result.isTerminal);
            System.assertEquals(2, result.numberOfErrors, 'Completed-with-errors must remain distinguishable.');
            System.assertEquals(3, result.jobItemsProcessed);
            System.assertEquals(5, result.totalJobItems);
        }
    }

    @IsTest
    static void testRejectsOtherOwnersJobTypesAndClasses() {
        // Async job ownership/type and counters are platform-managed, so validate these immutable guards with snapshots.
        assertUnavailableSnapshot(snapshot(null, 'BatchApex', 'RecurringExpenseBatch', 'Completed', 0));
        assertUnavailableSnapshot(snapshot(UserInfo.getUserId(), 'BatchApexWorker', 'RecurringExpenseBatch', 'Completed', 0));
        assertUnavailableSnapshot(snapshot(UserInfo.getUserId(), 'BatchApex', 'RecurringExpenseScheduler', 'Completed', 0));
        assertUnavailableSnapshot(snapshot(UserInfo.getUserId(), 'BatchApex', null, 'Completed', 0));
    }

    private static AsyncApexJob snapshot(Id ownerId, String jobType, String className, String status, Integer errors) {
        return (AsyncApexJob) JSON.deserialize(
            JSON.serialize(
                new Map<String, Object>{
                    'CreatedById' => ownerId,
                    'JobType' => jobType,
                    'ApexClass' => className == null ? null : new Map<String, Object>{ 'Name' => className },
                    'Status' => status,
                    'NumberOfErrors' => errors,
                    'JobItemsProcessed' => 3,
                    'TotalJobItems' => 5
                }
            ),
            AsyncApexJob.class
        );
    }

    private static void assertUnavailable(Id jobId) {
        try {
            RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
            System.assert(false, 'An unavailable job must be rejected.');
        } catch (AuraHandledException expected) {
            System.assertEquals('This recurring run is unavailable.', expected.getMessage());
        }
    }

    private static void assertUnavailableSnapshot(AsyncApexJob job) {
        try {
            RecurringExpenseAutomationController.statusForJob(job);
            System.assert(false, 'An unrelated job must be rejected.');
        } catch (AuraHandledException expected) {
            System.assertEquals('This recurring run is unavailable.', expected.getMessage());
        }
    }
}
