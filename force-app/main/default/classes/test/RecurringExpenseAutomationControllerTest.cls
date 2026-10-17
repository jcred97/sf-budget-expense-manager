@IsTest
private class RecurringExpenseAutomationControllerTest {
    @TestSetup
    static void users() {
        Id licenseId = [SELECT Profile.UserLicenseId FROM User WHERE Id = :UserInfo.getUserId()].Profile.UserLicenseId;
        List<Profile> profiles = [
            SELECT Id, Name
            FROM Profile
            WHERE UserLicenseId = :licenseId AND PermissionsModifyAllData = FALSE AND UserType = 'Standard'
            ORDER BY Name
        ];
        Id profileId = profiles[0].Id;
        for (Profile candidate : profiles) {
            if (candidate.Name == 'Minimum Access - Salesforce') {
                profileId = candidate.Id;
            }
        }
        List<User> actors = new List<User>();
        for (String role : new List<String>{ 'AutomationAdmin', 'AutomationUser' }) {
            actors.add(
                new User(
                    Alias = role == 'AutomationAdmin' ? 'autadmin' : 'autuser',
                    Email = role + '@example.invalid',
                    EmailEncodingKey = 'UTF-8',
                    LastName = role,
                    LanguageLocaleKey = 'en_US',
                    LocaleSidKey = 'en_US',
                    ProfileId = profileId,
                    TimeZoneSidKey = 'Asia/Manila',
                    Username = role + '.' + UserInfo.getOrganizationId() + '.' + DateTime.now().getTime() + '@example.invalid'
                )
            );
        }
        insert actors;
        assignPermission(actors[0].Id, 'Budget_Expense_Manager_Admin');
        assignPermission(actors[1].Id, 'Budget_Expense_Manager_User');
        assignPermission(UserInfo.getUserId(), 'Budget_Expense_Manager_Admin');

        // Simulate an additive controller-access grant without the custom permission.
        PermissionSet controllerOnly = new PermissionSet(Name = 'AutomationControllerOnly', Label = 'Automation Controller Only');
        insert controllerOnly;
        ApexClass controller = [
            SELECT Id
            FROM ApexClass
            WHERE Name = 'RecurringExpenseAutomationController' AND (NamespacePrefix = 'bemgr' OR NamespacePrefix = NULL)
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        insert new SetupEntityAccess(ParentId = controllerOnly.Id, SetupEntityId = controller.Id);
        insert new PermissionSetAssignment(AssigneeId = actors[1].Id, PermissionSetId = controllerOnly.Id);
    }

    private static void assignPermission(Id userId, String name) {
        PermissionSet permission = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = :name AND (NamespacePrefix = 'bemgr' OR NamespacePrefix = NULL)
            ORDER BY NamespacePrefix DESC NULLS LAST
            LIMIT 1
        ];
        if ([SELECT COUNT() FROM PermissionSetAssignment WHERE AssigneeId = :userId AND PermissionSetId = :permission.Id] == 0) {
            insert new PermissionSetAssignment(AssigneeId = userId, PermissionSetId = permission.Id);
        }
    }

    @IsTest
    static void testRestrictedUserCannotInvokeAutomationEvenWithControllerAccess() {
        User actor = [SELECT Id FROM User WHERE LastName = 'AutomationUser' LIMIT 1];
        System.runAs(actor) {
            System.assertEquals(false, FeatureManagement.checkPermission('Manage_Recurring_Expense_Automation'));
            Integer jobsBefore = [SELECT COUNT() FROM AsyncApexJob WHERE CreatedById = :actor.Id];
            assertPermissionDenied('batch');
            assertPermissionDenied('status');
            System.assertEquals(jobsBefore, [SELECT COUNT() FROM AsyncApexJob WHERE CreatedById = :actor.Id]);
        }
        System.assertEquals(
            0,
            [SELECT COUNT() FROM Budget_Expense_Manager_Setting__c],
            'Authorization must precede settings side effects.'
        );
        System.assertEquals(0, [SELECT COUNT() FROM Expense__c]);
    }

    @IsTest
    static void testRestrictedAdminCanGenerateAndTrackBatchWithoutPlatformJobPermissions() {
        insert new Budget_Expense_Manager_Setting__c(Name = 'Default', Recurring_Expenses_Enabled__c = true, Base_Currency_Code__c = 'PHP');
        User actor = [SELECT Id FROM User WHERE LastName = 'AutomationAdmin' LIMIT 1];
        System.runAs(actor) {
            System.assertEquals(true, FeatureManagement.checkPermission('Manage_Recurring_Expense_Automation'));
            Profile actorProfile = [
                SELECT PermissionsModifyAllData, PermissionsViewAllData, PermissionsAuthorApex
                FROM Profile
                WHERE Id = :UserInfo.getProfileId()
            ];
            System.assertEquals(false, actorProfile.PermissionsModifyAllData);
            System.assertEquals(false, actorProfile.PermissionsViewAllData);
            System.assertEquals(false, actorProfile.PermissionsAuthorApex);
            System.assertEquals(false, Budget_Expense_Manager_Setting__c.Last_Recurring_Run_Status__c.getDescribe().isUpdateable());
            Expense_Group__c groupRecord = new Expense_Group__c(Name = 'Restricted automation');
            insert groupRecord;
            Category__c category = new Category__c(Name = 'Subscription', Expense_Group__c = groupRecord.Id);
            insert category;
            Recurring_Expense__c template = new Recurring_Expense__c(
                Name = 'Restricted admin manual run',
                Active__c = true,
                Amount__c = 10,
                Category__c = category.Id,
                Frequency__c = 'Daily',
                Start_Date__c = Date.today(),
                Transaction_Type__c = 'Cash'
            );
            insert template;
            Test.startTest();
            Id jobId = RecurringExpenseAutomationController.runDueExpensesBatch();
            RecurringExpenseRunStatus queued = RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
            System.assertEquals(jobId, queued.jobId);
            System.assertEquals(false, queued.isTerminal);
            System.assertEquals(
                'Queued',
                [SELECT Last_Recurring_Run_Status__c FROM Budget_Expense_Manager_Setting__c LIMIT 1].Last_Recurring_Run_Status__c
            );
            Test.stopTest();
            RecurringExpenseRunStatus completed = RecurringExpenseAutomationController.getRecurringRunStatus(jobId);
            System.assertEquals('Completed', completed.status);
            System.assertEquals(true, completed.outcomeAvailable, 'The restricted admin batch must finish and persist its own result.');
            System.assertEquals(0, completed.numberOfErrors);
            System.assertEquals(1, [SELECT COUNT() FROM Expense__c WHERE Recurring_Expense__c = :template.Id]);
            System.assertEquals(
                Date.today().addDays(1),
                [SELECT Next_Run_Date__c FROM Recurring_Expense__c WHERE Id = :template.Id].Next_Run_Date__c,
                'The authorized batch advances the managed pointer.'
            );
            System.assertEquals(
                'Completed',
                [SELECT Last_Recurring_Run_Status__c FROM Budget_Expense_Manager_Setting__c LIMIT 1].Last_Recurring_Run_Status__c
            );
        }
    }

    private static void assertPermissionDenied(String action) {
        try {
            if (action == 'batch') {
                RecurringExpenseAutomationController.runDueExpensesBatch();
            } else {
                RecurringExpenseAutomationController.getRecurringRunStatus(null);
            }
            System.assert(false, 'Controller access alone must not authorize automation.');
        } catch (AuraHandledException expected) {
            System.assertEquals('You do not have permission to manage recurring expense automation.', expected.getMessage());
        }
    }

    @IsTest
    static void testTracksTheSubmittedJobThroughCompletion() {
        insert new Budget_Expense_Manager_Setting__c(Name = 'Default', Recurring_Expenses_Enabled__c = true, Base_Currency_Code__c = 'PHP');
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
        assignPermission(otherUser.Id, 'Budget_Expense_Manager_Admin');
        Test.startTest();
        Id jobId = Database.executeBatch(new RecurringExpenseBatch(), 1);
        System.runAs(otherUser) {
            System.assertEquals(true, FeatureManagement.checkPermission('Manage_Recurring_Expense_Automation'));
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
        assertUnavailableSnapshot(snapshot(UserInfo.getUserId(), 'BatchApex', 'RecurringExpenseBatch', 'Completed', 0, 'anotherpackage'));
    }

    private static AsyncApexJob snapshot(Id ownerId, String jobType, String className, String status, Integer errors) {
        String namespacePrefix = RecurringExpenseBatch.class.getName().contains('.')
            ? RecurringExpenseBatch.class.getName().substringBefore('.')
            : null;
        return snapshot(ownerId, jobType, className, status, errors, namespacePrefix);
    }

    private static AsyncApexJob snapshot(
        Id ownerId,
        String jobType,
        String className,
        String status,
        Integer errors,
        String namespacePrefix
    ) {
        return (AsyncApexJob) JSON.deserialize(
            JSON.serialize(
                new Map<String, Object>{
                    'CreatedById' => ownerId,
                    'JobType' => jobType,
                    'ApexClass' => className == null
                        ? null
                        : new Map<String, Object>{ 'Name' => className, 'NamespacePrefix' => namespacePrefix },
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
