/**
 * Applies recurring-template defaults and keeps an unadvanced next-run pointer aligned with its start date.
 */
public inherited sharing class RecurringExpenseTriggerHandler {
    /**
     * Routes supported recurring-expense trigger operations to their handlers.
     *
     * @param operation Current trigger operation.
     * @param recurringExpenses New recurring-expense record values.
     * @param oldRecurringExpenses Prior values keyed by record ID for update operations.
     */
    public static void run(
        System.TriggerOperation operation,
        List<Recurring_Expense__c> recurringExpenses,
        Map<Id, Recurring_Expense__c> oldRecurringExpenses
    ) {
        if (operation == System.TriggerOperation.BEFORE_INSERT) {
            beforeInsert(recurringExpenses);
            BankAssignmentValidator.validateRecurringExpenses(recurringExpenses, null);
        } else if (operation == System.TriggerOperation.BEFORE_UPDATE) {
            beforeUpdate(recurringExpenses, oldRecurringExpenses);
            BankAssignmentValidator.validateRecurringExpenses(
                recurringExpenses,
                oldRecurringExpenses
            );
        }
    }

    private static void beforeInsert(List<Recurring_Expense__c> recurringExpenses) {
        for (Recurring_Expense__c recurringExpense : recurringExpenses) {
            if (recurringExpense.Next_Run_Date__c == null) {
                recurringExpense.Next_Run_Date__c = recurringExpense.Start_Date__c;
            }
        }
    }

    private static void beforeUpdate(
        List<Recurring_Expense__c> recurringExpenses,
        Map<Id, Recurring_Expense__c> oldRecurringExpenses
    ) {
        for (Recurring_Expense__c recurringExpense : recurringExpenses) {
            Recurring_Expense__c oldRecurringExpense = oldRecurringExpenses.get(
                recurringExpense.Id
            );
            Boolean startDateChanged =
                recurringExpense.Start_Date__c != oldRecurringExpense.Start_Date__c;
            Boolean nextRunChanged =
                recurringExpense.Next_Run_Date__c != oldRecurringExpense.Next_Run_Date__c;
            Boolean nextRunStillTracksStart =
                oldRecurringExpense.Next_Run_Date__c == null ||
                oldRecurringExpense.Next_Run_Date__c == oldRecurringExpense.Start_Date__c;

            if (startDateChanged && !nextRunChanged && nextRunStillTracksStart) {
                recurringExpense.Next_Run_Date__c = recurringExpense.Start_Date__c;
            }
        }
    }
}
