/** Scheduled entry point for the daily recurring-expense batch. */
public with sharing class SpendlyRecurringExpenseScheduler implements Schedulable {
    /**
     * Starts recurring generation when globally enabled or records a skipped run.
     *
     * @param context Platform scheduling context.
     */
    public void execute(SchedulableContext context) {
        if (!SpendlySettingsService.areRecurringExpensesEnabled()) {
            SpendlySettingsService.markRecurringRunSkipped(
                'Recurring expenses are disabled in Spendly Settings.'
            );
            return;
        }

        Database.executeBatch(
            new SpendlyRecurringExpenseBatch(),
            SpendlyRecurringExpenseBatch.DEFAULT_BATCH_SIZE
        );
    }
}
