/** Performs user-mode mutations for expenses and recurring templates. */
public with sharing class SpendlyExpenseCommandService {
    /**
     * Marks a recurring-expense template inactive after validating access and existence.
     *
     * @param recurringExpenseId Recurring template to deactivate.
     */
    public static void deactivateRecurringExpense(Id recurringExpenseId) {
        if (recurringExpenseId == null) {
            throw handledException('Recurring Expense Id is required.');
        }

        try {
            List<Recurring_Expense__c> recurringExpenses = [
                SELECT Id, Active__c
                FROM Recurring_Expense__c
                WHERE Id = :recurringExpenseId
                WITH USER_MODE
                LIMIT 1
            ];
            if (recurringExpenses.isEmpty()) {
                throw handledException('Recurring Expense not found or already deleted.');
            }

            Recurring_Expense__c recurringExpenseUpdate = new Recurring_Expense__c(
                Id = recurringExpenses[0].Id,
                Active__c = false
            );
            List<Recurring_Expense__c> updates = (List<Recurring_Expense__c>) Security.stripInaccessible(
                    AccessType.UPDATABLE,
                    new List<Recurring_Expense__c>{ recurringExpenseUpdate }
                )
                .getRecords();
            Database.update(updates, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw handledException('Failed to deactivate recurring expense: ' + e.getMessage());
        }
    }

    /**
     * Deletes the accessible expenses matching the supplied IDs in one DML operation.
     *
     * @param expenseIds Expense records to delete.
     */
    public static void deleteExpenses(List<Id> expenseIds) {
        Set<Id> requestedExpenseIds = requireExpenseIds(expenseIds);
        try {
            List<Expense__c> expenses = [
                SELECT Id
                FROM Expense__c
                WHERE Id IN :requestedExpenseIds
                WITH USER_MODE
            ];
            ensureExpensesCanBeDeleted();
            Database.delete(expenses, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw handledException('Failed to delete expenses: ' + e.getMessage());
        }
    }

    /**
     * Deletes one accessible expense and reports missing records with a handled error.
     *
     * @param expenseId Expense record to delete.
     */
    public static void deleteExpense(Id expenseId) {
        requireExpenseId(expenseId);

        try {
            throwForcedDeleteExceptionForTest(expenseId);
            Expense__c expense = getExpenseForDeletion(expenseId);
            ensureExpensesCanBeDeleted();
            Database.delete(expense, AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw handledException('Failed to delete expense: ' + e.getMessage());
        }
    }

    private static Set<Id> requireExpenseIds(List<Id> expenseIds) {
        if (expenseIds == null) {
            throw handledException('No expense IDs provided.');
        }
        Set<Id> requestedExpenseIds = new Set<Id>(expenseIds);
        if (requestedExpenseIds.isEmpty()) {
            throw handledException('No expense IDs provided.');
        }
        return requestedExpenseIds;
    }

    private static void requireExpenseId(Id expenseId) {
        if (expenseId == null) {
            throw handledException('Expense Id is required for deletion.');
        }
    }

    private static void throwForcedDeleteExceptionForTest(Id expenseId) {
        if (Test.isRunningTest() && expenseId == UserInfo.getUserId()) {
            throw new DmlException('Forced test exception');
        }
    }

    private static Expense__c getExpenseForDeletion(Id expenseId) {
        List<Expense__c> expenses = [
            SELECT Id
            FROM Expense__c
            WHERE Id = :expenseId
            WITH USER_MODE
            LIMIT 1
        ];
        if (expenses.isEmpty()) {
            throw handledException('Expense not found or already deleted.');
        }
        return expenses[0];
    }

    private static void ensureExpensesCanBeDeleted() {
        if (!Schema.sObjectType.Expense__c.isDeletable()) {
            throw handledException('You do not have permission to delete expenses.');
        }
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
