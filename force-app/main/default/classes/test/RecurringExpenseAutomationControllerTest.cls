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
    }

    @IsTest
    static void testUnavailableInputsReturnTheSameMessage() {
        assertUnavailable(null);
        Expense_Group__c groupRecord = new Expense_Group__c(Name = 'Wrong object');
        insert groupRecord;
        assertUnavailable(groupRecord.Id);
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
