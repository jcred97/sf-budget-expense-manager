/** Manages the singleton Budget & Expense Manager settings record, scheduler configuration, and recurring-run status. */
public with sharing class BudgetExpenseSettingsService {
    private static final String DEFAULT_SETTINGS_NAME = 'Default';
    private static final String RECURRING_SCHEDULE_NAME = 'Budget Expense Manager Recurring Daily';
    private static final Time DEFAULT_RECURRING_RUN_TIME = Time.newInstance(8, 0, 0, 0);
    private static final String RUN_TIME_PATTERN = '^(?:[01]\\d|2[0-3]):[0-5]\\d$';

    /** User-editable settings values accepted from the settings LWC. */
    public class SettingsUpdateRequest {
        /** Whether recurring expense automation should be enabled. */
        @AuraEnabled
        public String recurringExpensesEnabled { get; set; }
        /** Daily recurring expense run time in HH:mm format. */
        @AuraEnabled
        public String globalRecurringRunTime { get; set; }
    }

    /** Settings and scheduler state returned to the settings LWC. */
    public class SettingsState {
        @AuraEnabled
        public Id settingsId;
        @AuraEnabled
        public Boolean recurringExpensesEnabled;
        @AuraEnabled
        public String globalRecurringRunTime;
        @AuraEnabled
        public Datetime lastRecurringRunDateTime;
        @AuraEnabled
        public String lastRecurringRunStatus;
        @AuraEnabled
        public String lastRecurringRunMessage;
        @AuraEnabled
        public Boolean recurringScheduleActive;
        @AuraEnabled
        public String recurringScheduleState;
        @AuraEnabled
        public Datetime recurringScheduleNextRunDateTime;
        @AuraEnabled
        public String recurringScheduleTimeZone;
        @AuraEnabled
        public String recurringScheduleCronExpression;

        /**
         * Builds UI state from the settings record and current recurring schedule.
         *
         * @param settings Singleton app settings record.
         */
        public SettingsState(Budget_Expense_Manager_Setting__c settings) {
            this.settingsId = settings.Id;
            this.recurringExpensesEnabled = settings.Recurring_Expenses_Enabled__c;
            this.globalRecurringRunTime = formatRunTime(
                getEffectiveRunTime(settings.Global_Recurring_Run_Time__c)
            );
            this.lastRecurringRunDateTime = settings.Last_Recurring_Run_DateTime__c;
            this.lastRecurringRunStatus = settings.Last_Recurring_Run_Status__c;
            this.lastRecurringRunMessage = settings.Last_Recurring_Run_Message__c;

            CronTrigger recurringSchedule = getRecurringSchedule();
            this.recurringScheduleActive =
                recurringSchedule != null &&
                recurringSchedule.NextFireTime != null;
            this.recurringScheduleState = recurringSchedule == null
                ? 'Not scheduled'
                : recurringSchedule.State;
            this.recurringScheduleNextRunDateTime = recurringSchedule?.NextFireTime;
            this.recurringScheduleTimeZone = recurringSchedule == null
                ? UserInfo.getTimeZone().getID()
                : recurringSchedule.TimeZoneSidKey;
            this.recurringScheduleCronExpression = recurringSchedule?.CronExpression;
        }
    }

    /**
     * Returns the current settings and scheduler state, creating default settings when absent.
     *
     * @return Settings state for the current user.
     */
    @AuraEnabled
    public static SettingsState getSettings() {
        return new SettingsState(getOrCreateSettings());
    }

    /**
     * Saves global recurring settings and reschedules the daily job when its run time changes.
     *
     * @param request Updated enablement and daily run-time values.
     * @return Persisted settings and current scheduler state.
     */
    @AuraEnabled
    public static SettingsState saveSettings(SettingsUpdateRequest request) {
        Budget_Expense_Manager_Setting__c settings = getOrCreateSettings();
        SettingsUpdateRequest safeRequest = getSafeSettingsUpdate(request, settings);
        Time originalRunTime = getEffectiveRunTime(settings.Global_Recurring_Run_Time__c);
        Time requestedRunTime = parseRunTime(safeRequest.globalRecurringRunTime);
        Boolean requestedEnabled = safeRequest.recurringExpensesEnabled == 'true';
        Budget_Expense_Manager_Setting__c settingsUpdate = new Budget_Expense_Manager_Setting__c(
            Id = settings.Id,
            Recurring_Expenses_Enabled__c = requestedEnabled,
            Global_Recurring_Run_Time__c = requestedRunTime
        );
        List<Budget_Expense_Manager_Setting__c> updates = (List<Budget_Expense_Manager_Setting__c>) Security.stripInaccessible(
                AccessType.UPDATABLE,
                new List<Budget_Expense_Manager_Setting__c>{ settingsUpdate }
            )
            .getRecords();
        Database.update(updates, AccessLevel.USER_MODE);

        settings.Recurring_Expenses_Enabled__c = requestedEnabled;
        settings.Global_Recurring_Run_Time__c = requestedRunTime;

        if (originalRunTime != requestedRunTime) {
            rescheduleRecurringExpenses(requestedRunTime);
        }

        return new SettingsState(settings);
    }

    /**
     * Returns whether global recurring-expense automation is enabled.
     *
     * @return True when recurring generation is enabled.
     */
    public static Boolean areRecurringExpensesEnabled() {
        return getOrCreateSettings().Recurring_Expenses_Enabled__c;
    }

    /**
     * Records that a manual recurring-expense batch was queued.
     *
     * @param jobId Queued Salesforce batch job ID.
     */
    public static void markRecurringRunQueued(Id jobId) {
        updateRecurringRunStatus('Queued', 'Recurring expense generation is queued.');
    }

    /**
     * Records aggregate counts and a user-facing message for a completed recurring run.
     *
     * @param expensesCreated Number of expenses created.
     * @param recurringExpensesProcessed Number of recurring templates processed.
     */
    public static void markRecurringRunCompleted(
        Integer expensesCreated,
        Integer recurringExpensesProcessed
    ) {
        Integer expenseCount = expensesCreated == null ? 0 : expensesCreated;
        Integer templateCount = recurringExpensesProcessed == null ? 0 : recurringExpensesProcessed;
        String message = expenseCount == 0
            ? 'No recurring expenses were due.'
            : 'Created ' +
              String.valueOf(expenseCount) +
              ' ' +
              pluralize('expense', expenseCount) +
              ' from ' +
              String.valueOf(templateCount) +
              ' recurring ' +
              pluralize('template', templateCount) +
              '.';

        updateRecurringRunStatus('Completed', message);
    }

    /**
     * Records that recurring generation was skipped.
     *
     * @param message User-facing reason the run was skipped.
     */
    public static void markRecurringRunSkipped(String message) {
        updateRecurringRunStatus('Skipped', message);
    }

    private static Budget_Expense_Manager_Setting__c getOrCreateSettings() {
        List<Budget_Expense_Manager_Setting__c> settingsRecords = [
            SELECT
                Id,
                Name,
                Recurring_Expenses_Enabled__c,
                Global_Recurring_Run_Time__c,
                Last_Recurring_Run_DateTime__c,
                Last_Recurring_Run_Status__c,
                Last_Recurring_Run_Message__c
            FROM Budget_Expense_Manager_Setting__c
            WITH USER_MODE
            ORDER BY CreatedDate ASC
            LIMIT 1
        ];

        if (!settingsRecords.isEmpty()) {
            return settingsRecords[0];
        }

        Budget_Expense_Manager_Setting__c settings = new Budget_Expense_Manager_Setting__c(
            Name = DEFAULT_SETTINGS_NAME,
            Recurring_Expenses_Enabled__c = true,
            Global_Recurring_Run_Time__c = DEFAULT_RECURRING_RUN_TIME
        );
        List<Budget_Expense_Manager_Setting__c> inserts = (List<Budget_Expense_Manager_Setting__c>) Security.stripInaccessible(
                AccessType.CREATABLE,
                new List<Budget_Expense_Manager_Setting__c>{ settings }
            )
            .getRecords();
        Database.insert(inserts, AccessLevel.USER_MODE);
        return inserts[0];
    }

    private static Time getEffectiveRunTime(Time runTime) {
        return runTime == null ? DEFAULT_RECURRING_RUN_TIME : runTime;
    }

    private static SettingsUpdateRequest getSafeSettingsUpdate(
        SettingsUpdateRequest request,
        Budget_Expense_Manager_Setting__c settings
    ) {
        if (request != null) {
            return request;
        }
        SettingsUpdateRequest defaultRequest = new SettingsUpdateRequest();
        defaultRequest.recurringExpensesEnabled = String.valueOf(
            settings.Recurring_Expenses_Enabled__c
        );
        defaultRequest.globalRecurringRunTime = formatRunTime(
            getEffectiveRunTime(settings.Global_Recurring_Run_Time__c)
        );
        return defaultRequest;
    }

    private static Time parseRunTime(String runTimeValue) {
        if (String.isBlank(runTimeValue)) {
            return DEFAULT_RECURRING_RUN_TIME;
        }
        if (!Pattern.matches(RUN_TIME_PATTERN, runTimeValue)) {
            throw new AuraHandledException('Enter a valid recurring run time.');
        }
        List<String> parts = runTimeValue.split(':');
        return Time.newInstance(Integer.valueOf(parts[0]), Integer.valueOf(parts[1]), 0, 0);
    }

    private static String formatRunTime(Time runTime) {
        return String.valueOf(runTime.hour()).leftPad(2, '0') +
            ':' +
            String.valueOf(runTime.minute()).leftPad(2, '0');
    }

    private static String buildDailyCron(Time runTime) {
        Time effectiveRunTime = getEffectiveRunTime(runTime);
        return '0 ' +
            String.valueOf(effectiveRunTime.minute()) +
            ' ' +
            String.valueOf(effectiveRunTime.hour()) +
            ' * * ?';
    }

    private static String pluralize(String singularValue, Integer count) {
        return count == 1 ? singularValue : singularValue + 's';
    }

    private static CronTrigger getRecurringSchedule() {
        List<CronTrigger> recurringSchedules = [
            SELECT CronExpression, NextFireTime, State, TimeZoneSidKey
            FROM CronTrigger
            WHERE CronJobDetail.Name = :RECURRING_SCHEDULE_NAME AND State != 'DELETED'
            WITH USER_MODE
            ORDER BY NextFireTime ASC
            LIMIT 1
        ];

        return recurringSchedules.isEmpty() ? null : recurringSchedules[0];
    }

    private static void rescheduleRecurringExpenses(Time runTime) {
        List<CronTrigger> existingJobs = [
            SELECT Id
            FROM CronTrigger
            WHERE CronJobDetail.Name = :RECURRING_SCHEDULE_NAME
            WITH USER_MODE
        ];

        for (CronTrigger existingJob : existingJobs) {
            System.abortJob(existingJob.Id);
        }

        System.schedule(
            RECURRING_SCHEDULE_NAME,
            buildDailyCron(runTime),
            new RecurringExpenseScheduler()
        );
    }

    private static void updateRecurringRunStatus(String status, String message) {
        Budget_Expense_Manager_Setting__c settings = getOrCreateSettings();
        Budget_Expense_Manager_Setting__c settingsUpdate = new Budget_Expense_Manager_Setting__c(
            Id = settings.Id,
            Last_Recurring_Run_DateTime__c = System.now(),
            Last_Recurring_Run_Status__c = status,
            Last_Recurring_Run_Message__c = message
        );
        List<Budget_Expense_Manager_Setting__c> updates = (List<Budget_Expense_Manager_Setting__c>) Security.stripInaccessible(
                AccessType.UPDATABLE,
                new List<Budget_Expense_Manager_Setting__c>{ settingsUpdate }
            )
            .getRecords();
        Database.update(updates, AccessLevel.USER_MODE);
    }
}
