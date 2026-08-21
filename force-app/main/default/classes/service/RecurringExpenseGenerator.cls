/** Generates and persists expenses from due recurring templates. */
public with sharing class RecurringExpenseGenerator {
    /** Options controlling the generation cutoff, cap, and transaction time. */
    public class GenerationOptions {
        public Date runDate;
        public Integer maxExpenses;
        public Time generatedTransactionTime;
    }

    private class GenerationContext {
        public RecurringExpenseGenerationResult result;
        public List<Expense__c> expensesToInsert;
        public List<Recurring_Expense__c> recurringExpensesToUpdate;
        public Date runDate;
        public Integer maxExpenses;
        public Time generatedTransactionTime;

        /**
         * Creates mutable state for one generation transaction.
         *
         * @param runDate Inclusive generation cutoff.
         * @param maxExpenses Maximum expenses allowed in the transaction.
         * @param generatedTransactionTime Transaction time assigned to generated expenses.
         */
        public GenerationContext(Date runDate, Integer maxExpenses, Time generatedTransactionTime) {
            this.result = new RecurringExpenseGenerationResult(runDate);
            this.expensesToInsert = new List<Expense__c>();
            this.recurringExpensesToUpdate = new List<Recurring_Expense__c>();
            this.runDate = runDate;
            this.maxExpenses = maxExpenses;
            this.generatedTransactionTime = generatedTransactionTime;
        }
    }

    /**
     * Generates due expenses, advances template pointers, and persists both record collections.
     *
     * @param dueRecurringExpenses Recurring templates eligible for processing.
     * @param options Generation cutoff, cap, and transaction time.
     * @return Counts and limit status for the generation transaction.
     */
    public static RecurringExpenseGenerationResult generate(
        List<Recurring_Expense__c> dueRecurringExpenses,
        GenerationOptions options
    ) {
        GenerationContext context = new GenerationContext(
            options.runDate,
            options.maxExpenses,
            options.generatedTransactionTime
        );
        if (dueRecurringExpenses == null || dueRecurringExpenses.isEmpty()) {
            return context.result;
        }

        generateExpenses(dueRecurringExpenses, context);
        persistGeneration(context);
        return context.result;
    }

    private static void generateExpenses(
        List<Recurring_Expense__c> dueRecurringExpenses,
        GenerationContext context
    ) {
        for (Recurring_Expense__c recurringExpense : dueRecurringExpenses) {
            generateExpensesForTemplate(recurringExpense, context);
            if (context.result.hitGenerationLimit) {
                return;
            }
        }
    }

    private static void generateExpensesForTemplate(
        Recurring_Expense__c recurringExpense,
        GenerationContext context
    ) {
        Boolean generatedForTemplate = false;
        Date dueDate = recurringExpense.Next_Run_Date__c;

        while (
            RecurringExpenseCalculator.shouldGenerateForDate(
                recurringExpense,
                dueDate,
                context.runDate
            )
        ) {
            if (context.expensesToInsert.size() >= context.maxExpenses) {
                context.result.hitGenerationLimit = true;
                break;
            }

            context.expensesToInsert.add(
                buildExpense(recurringExpense, dueDate, context.generatedTransactionTime)
            );
            dueDate = RecurringExpenseCalculator.getNextRunDate(
                dueDate,
                recurringExpense.Frequency__c,
                recurringExpense.Start_Date__c
            );
            recurringExpense.Next_Run_Date__c = dueDate;
            generatedForTemplate = true;
        }

        if (generatedForTemplate) {
            context.recurringExpensesToUpdate.add(recurringExpense);
        }
    }

    private static void persistGeneration(GenerationContext context) {
        persistExpenses(context);
        persistRecurringExpenses(context);
    }

    private static void persistExpenses(GenerationContext context) {
        if (context.expensesToInsert.isEmpty()) {
            return;
        }
        // Generated expenses include the system-managed recurring link, which users cannot edit.
        Database.insert(context.expensesToInsert, AccessLevel.SYSTEM_MODE);
        context.result.expensesCreated = context.expensesToInsert.size();
    }

    private static void persistRecurringExpenses(GenerationContext context) {
        if (context.recurringExpensesToUpdate.isEmpty()) {
            return;
        }

        List<Recurring_Expense__c> pointerUpdates = new List<Recurring_Expense__c>();
        for (Recurring_Expense__c recurringExpense : context.recurringExpensesToUpdate) {
            pointerUpdates.add(
                new Recurring_Expense__c(
                    Id = recurringExpense.Id,
                    Next_Run_Date__c = recurringExpense.Next_Run_Date__c
                )
            );
        }

        // Next Run Date is intentionally read-only to users and is advanced only by automation.
        Database.update(pointerUpdates, AccessLevel.SYSTEM_MODE);
        Integer updatedCount = context.recurringExpensesToUpdate.size();
        context.result.recurringExpensesProcessed = updatedCount;
        context.result.recurringExpensesUpdated = updatedCount;
    }

    private static Expense__c buildExpense(
        Recurring_Expense__c recurringExpense,
        Date dueDate,
        Time generatedTransactionTime
    ) {
        return new Expense__c(
            Name = recurringExpense.Name,
            Amount__c = recurringExpense.Amount__c,
            Bank__c = recurringExpense.Bank__c,
            Bank_Assignment__c = recurringExpense.Bank_Assignment__c,
            Category__c = recurringExpense.Category__c,
            Description__c = recurringExpense.Description__c,
            Expense_Date__c = dueDate,
            Recurring_Expense__c = recurringExpense.Id,
            Transaction_Time__c = generatedTransactionTime,
            Transaction_Type__c = recurringExpense.Transaction_Type__c
        );
    }
}
