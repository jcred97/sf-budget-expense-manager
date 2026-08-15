/** Scheduled entry point for the daily recurring-expense batch. */
public with sharing class RecurringExpenseScheduler implements Schedulable {
    /**
     * Starts recurring generation when globally enabled or records a skipped run.
     *
     * @param context Platform scheduling context.
     */
    public void execute(SchedulableContext context) {
        if (!BudgetExpenseSettingsService.areRecurringExpensesEnabled()) {
            BudgetExpenseSettingsService.markRecurringRunSkipped(
                'Recurring expenses are disabled in Budget & Expense Manager Settings.'
            );
            return;
        }

        Database.executeBatch(
            new RecurringExpenseBatch(),
            RecurringExpenseBatch.DEFAULT_BATCH_SIZE
        );
    }
}
