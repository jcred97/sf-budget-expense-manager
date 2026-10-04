/** Lightning-facing controller for recurring-expense generation automation. */
public with sharing class RecurringExpenseAutomationController {
    /**
     * Generates due recurring expenses for today using the synchronous run cap.
     *
     * @return Generation counts and limit status.
     */
    @AuraEnabled
    public static RecurringExpenseGenerationResult generateDueExpenses() {
        return RecurringExpenseService.generateDueExpenses();
    }

    /**
     * Queues the recurring-expense batch and records its queued status.
     *
     * @return Salesforce batch job ID.
     */
    @AuraEnabled
    public static Id runDueExpensesBatch() {
        return RecurringExpenseService.runDueExpensesBatch();
    }

    /** Returns progress for a recurring batch submitted by the current user. */
    @AuraEnabled
    public static RecurringExpenseRunStatus getRecurringRunStatus(Id jobId) {
        if (jobId == null || jobId.getSObjectType() != AsyncApexJob.SObjectType) {
            throw unavailableRun();
        }
        Id currentUserId = UserInfo.getUserId();
        List<AsyncApexJob> jobs = [
            SELECT Id, CreatedById, JobType, ApexClass.Name, Status, NumberOfErrors, JobItemsProcessed, TotalJobItems
            FROM AsyncApexJob
            WHERE Id = :jobId AND CreatedById = :currentUserId
            WITH USER_MODE
            LIMIT 1
        ];
        if (jobs.isEmpty()) {
            throw unavailableRun();
        }
        return statusForJob(jobs[0]);
    }

    @TestVisible
    private static RecurringExpenseRunStatus statusForJob(AsyncApexJob job) {
        if (
            job.CreatedById != UserInfo.getUserId() ||
            job.JobType != 'BatchApex' ||
            job.ApexClass == null ||
            job.ApexClass.Name != 'RecurringExpenseBatch'
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

    private static AuraHandledException unavailableRun() {
        AuraHandledException error = new AuraHandledException('This recurring run is unavailable.');
        error.setMessage('This recurring run is unavailable.');
        return error;
    }
}
