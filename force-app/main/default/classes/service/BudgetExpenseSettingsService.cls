/** Manages the singleton Budget & Expense Manager settings record, scheduler configuration, and recurring-run status. */
public with sharing class BudgetExpenseSettingsService {
    private static final String DEFAULT_SETTINGS_NAME = 'Default';
    private static final String RECURRING_SCHEDULE_NAME = 'Budget Expense Manager Recurring Daily';
    private static final Time DEFAULT_RECURRING_RUN_TIME = Time.newInstance(8, 0, 0, 0);
    private static final String RUN_TIME_PATTERN = '^(?:[01]\\d|2[0-3]):[0-5]\\d$';

    /**
     * Returns the current settings and scheduler state, creating default settings when absent.
     *
     * @return Settings state for the current user.
     */
    public static BudgetExpenseSettingsState getSettings() {
        Budget_Expense_Manager_Setting__c settings = getOrCreateSettings();
        initializeBaseCurrency(settings);
        return buildSettingsState(settings);
    }

    /**
     * Saves global recurring settings and reschedules the daily job when its run time changes.
     *
     * @param request Updated enablement and daily run-time values.
     * @return Persisted settings and current scheduler state.
     */
    public static BudgetExpenseSettingsState saveSettings(
        BudgetExpenseSettingsUpdateRequest request
    ) {
        Budget_Expense_Manager_Setting__c settings = getOrCreateSettings();
        initializeBaseCurrency(settings);
        BudgetExpenseSettingsUpdateRequest safeRequest = getSafeSettingsUpdate(request, settings);
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

        return buildSettingsState(settings);
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

    private static void initializeBaseCurrency(Budget_Expense_Manager_Setting__c settings) {
        List<Budget_Expense_Manager_Setting__c> currencySettings = [
            SELECT Base_Currency_Code__c
            FROM Budget_Expense_Manager_Setting__c
            WHERE Id = :settings.Id
            WITH USER_MODE
            LIMIT 1
            FOR UPDATE
        ];
        if (currencySettings.isEmpty()) {
            throw new CurrencyContextService.CurrencyContextException(
                'The app base currency settings record is not accessible.'
            );
        }

        String baseCurrencyCode = currencySettings[0].Base_Currency_Code__c;
        if (String.isBlank(baseCurrencyCode)) {
            baseCurrencyCode = CurrencyContextService.resolveOrganizationCurrencyCode();
            Budget_Expense_Manager_Setting__c settingsUpdate = new Budget_Expense_Manager_Setting__c(
                Id = settings.Id,
                Base_Currency_Code__c = baseCurrencyCode
            );
            List<Budget_Expense_Manager_Setting__c> updates = (List<Budget_Expense_Manager_Setting__c>) Security.stripInaccessible(
                    AccessType.UPDATABLE,
                    new List<Budget_Expense_Manager_Setting__c>{ settingsUpdate }
                )
                .getRecords();
            if (updates[0].Base_Currency_Code__c == null) {
                throw new CurrencyContextService.CurrencyContextException(
                    'You do not have permission to initialize the app base currency.'
                );
            }
            Database.update(updates, AccessLevel.USER_MODE);
        }

        settings.Base_Currency_Code__c = baseCurrencyCode;
    }

    private static Time getEffectiveRunTime(Time runTime) {
        return runTime == null ? DEFAULT_RECURRING_RUN_TIME : runTime;
    }

    private static BudgetExpenseSettingsUpdateRequest getSafeSettingsUpdate(
        BudgetExpenseSettingsUpdateRequest request,
        Budget_Expense_Manager_Setting__c settings
    ) {
        if (request != null) {
            return request;
        }
        BudgetExpenseSettingsUpdateRequest defaultRequest = new BudgetExpenseSettingsUpdateRequest();
        defaultRequest.recurringExpensesEnabled = String.valueOf(
            settings.Recurring_Expenses_Enabled__c
        );
        defaultRequest.globalRecurringRunTime = formatRunTime(
            getEffectiveRunTime(settings.Global_Recurring_Run_Time__c)
        );
        return defaultRequest;
    }

    private static BudgetExpenseSettingsState buildSettingsState(
        Budget_Expense_Manager_Setting__c settings
    ) {
        BudgetExpenseSettingsState state = new BudgetExpenseSettingsState();
        state.settingsId = settings.Id;
        state.baseCurrencyCode = settings.Base_Currency_Code__c;
        state.recurringExpensesEnabled = settings.Recurring_Expenses_Enabled__c;
        state.globalRecurringRunTime = formatRunTime(
            getEffectiveRunTime(settings.Global_Recurring_Run_Time__c)
        );
        state.lastRecurringRunDateTime = settings.Last_Recurring_Run_DateTime__c;
        state.lastRecurringRunStatus = settings.Last_Recurring_Run_Status__c;
        state.lastRecurringRunMessage = settings.Last_Recurring_Run_Message__c;

        CronTrigger recurringSchedule = getRecurringSchedule();
        state.recurringScheduleActive =
            recurringSchedule != null &&
            recurringSchedule.NextFireTime != null;
        state.recurringScheduleState = recurringSchedule == null
            ? 'Not scheduled'
            : recurringSchedule.State;
        state.recurringScheduleNextRunDateTime = recurringSchedule?.NextFireTime;
        state.recurringScheduleTimeZone = recurringSchedule == null
            ? UserInfo.getTimeZone().getID()
            : recurringSchedule.TimeZoneSidKey;
        state.recurringScheduleCronExpression = recurringSchedule?.CronExpression;
        return state;
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
