/** Lightning-facing controller for recurring-expense generation automation. */
public with sharing class RecurringExpenseAutomationController {
    /**
     * Queues the recurring-expense batch and records its queued status.
     *
     * @return Salesforce batch job ID.
     */
    @AuraEnabled
    public static Id runDueExpensesBatch() {
        requireAutomationPermission();
        return RecurringExpenseService.runDueExpensesBatch();
    }

    /** Returns progress for a recurring batch submitted by the current user. */
    @AuraEnabled
    public static RecurringExpenseRunStatus getRecurringRunStatus(Id jobId) {
        requireAutomationPermission();
        if (jobId == null || jobId.getSObjectType() != AsyncApexJob.SObjectType) {
            throw unavailableRun();
        }
        Id currentUserId = UserInfo.getUserId();
        // Platform job metadata is internal. Authorize the caller first, then restrict
        // this system-mode read to the caller's one requested recurring batch.
        List<AsyncApexJob> jobs = [
            SELECT
                Id,
                CreatedById,
                JobType,
                ApexClass.Name,
                ApexClass.NamespacePrefix,
                Status,
                NumberOfErrors,
                JobItemsProcessed,
                TotalJobItems
            FROM AsyncApexJob
            WHERE Id = :jobId AND CreatedById = :currentUserId AND JobType = 'BatchApex' AND ApexClass.Name = 'RecurringExpenseBatch'
            WITH SYSTEM_MODE
            LIMIT 1
        ];
        if (jobs.isEmpty()) {
            throw unavailableRun();
        }
        RecurringExpenseRunStatus result = statusForJob(jobs[0]);
        if (result.isTerminal) {
            // Authorize the exact job above before reading its internal outcome in system mode.
            String requestedJobId = String.valueOf(jobId);
            List<Recurring_Expense_Run__c> outcomes = [
                SELECT Has_Catch_Up_Remaining__c
                FROM Recurring_Expense_Run__c
                WHERE Job_Id__c = :requestedJobId
                WITH SYSTEM_MODE
                LIMIT 1
            ];
            if (!outcomes.isEmpty()) {
                result.outcomeAvailable = true;
                result.hasCatchUpRemaining = outcomes[0].Has_Catch_Up_Remaining__c;
            }
        }
        return result;
    }

    @TestVisible
    private static RecurringExpenseRunStatus statusForJob(AsyncApexJob job) {
        if (
            job.CreatedById != UserInfo.getUserId() ||
            job.JobType != 'BatchApex' ||
            job.ApexClass == null ||
            qualifiedClassName(job.ApexClass) != RecurringExpenseBatch.class.getName()
        ) {
            throw unavailableRun();
        }
        RecurringExpenseRunStatus result = new RecurringExpenseRunStatus();
        result.jobId = job.Id;
        result.status = job.Status;
        result.isTerminal = new Set<String>{ 'Completed', 'Failed', 'Aborted' }.contains(job.Status);
        result.numberOfErrors = job.NumberOfErrors;
        result.jobItemsProcessed = job.JobItemsProcessed;
        result.totalJobItems = job.TotalJobItems;
        return result;
    }

    private static String qualifiedClassName(ApexClass batchClass) {
        return String.isBlank(batchClass.NamespacePrefix) ? batchClass.Name : batchClass.NamespacePrefix + '.' + batchClass.Name;
    }

    private static void requireAutomationPermission() {
        if (!FeatureManagement.checkPermission('Manage_Recurring_Expense_Automation')) {
            AuraHandledException error = new AuraHandledException('You do not have permission to manage recurring expense automation.');
            error.setMessage('You do not have permission to manage recurring expense automation.');
            throw error;
        }
    }

    private static AuraHandledException unavailableRun() {
        AuraHandledException error = new AuraHandledException('This recurring run is unavailable.');
        error.setMessage('This recurring run is unavailable.');
        return error;
    }
}
