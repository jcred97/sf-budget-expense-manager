public with sharing class SpendlyRecurringExpenseGenerator {
    public class GenerationOptions {
        public Date runDate;
        public Integer maxExpenses;
        public Time generatedTransactionTime;
    }

    private class GenerationContext {
        public SpendlyRecurringExpenseService.GenerationResult result;
        public List<Expense__c> expensesToInsert;
        public List<Recurring_Expense__c> recurringExpensesToUpdate;
        public Date runDate;
        public Integer maxExpenses;
        public Time generatedTransactionTime;

        public GenerationContext(Date runDate, Integer maxExpenses, Time generatedTransactionTime) {
            this.result = new SpendlyRecurringExpenseService.GenerationResult(runDate);
            this.expensesToInsert = new List<Expense__c>();
            this.recurringExpensesToUpdate = new List<Recurring_Expense__c>();
            this.runDate = runDate;
            this.maxExpenses = maxExpenses;
            this.generatedTransactionTime = generatedTransactionTime;
        }
    }

    public static SpendlyRecurringExpenseService.GenerationResult generate(
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
            SpendlyRecurringExpenseCalculator.shouldGenerateForDate(
                recurringExpense,
                dueDate,
                context.runDate
            )
        ) {
            if (context.expensesToInsert.size() >= context.maxExpenses) {
                context.result.hitGenerationLimit = true;
                return;
            }

            context.expensesToInsert.add(
                buildExpense(recurringExpense, dueDate, context.generatedTransactionTime)
            );
            dueDate = SpendlyRecurringExpenseCalculator.getNextRunDate(
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
        Database.insert(context.expensesToInsert, AccessLevel.USER_MODE);
        context.result.expensesCreated = context.expensesToInsert.size();
    }

    private static void persistRecurringExpenses(GenerationContext context) {
        if (context.recurringExpensesToUpdate.isEmpty()) {
            return;
        }
        Database.update(context.recurringExpensesToUpdate, AccessLevel.USER_MODE);
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
            Category__c = recurringExpense.Category__c,
            Description__c = recurringExpense.Description__c,
            Expense_Date__c = dueDate,
            Recurring_Expense__c = recurringExpense.Id,
            Transaction_Time__c = generatedTransactionTime,
            Transaction_Type__c = recurringExpense.Transaction_Type__c
        );
    }
}
