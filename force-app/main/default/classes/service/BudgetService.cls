/** Queries and mutates optional monthly expense-group budgets in user mode. */
public inherited sharing class BudgetService {
    /**
     * Returns the optional budget for an expense group and normalized calendar month.
     *
     * @param expenseGroupId Expense group that owns the budget.
     * @param budgetMonth Any date in the requested calendar month.
     * @return The monthly budget or null when none exists.
     */
    public static BudgetDto getMonthlyBudget(Id expenseGroupId, Date budgetMonth) {
        requireExpenseGroupId(expenseGroupId);
        Date normalizedBudgetMonth = normalizeBudgetMonth(budgetMonth);
        List<Budget__c> budgets = [
            SELECT Id, Expense_Group__c, Budget_Month__c, Amount__c, Description__c
            FROM Budget__c
            WHERE Expense_Group__c = :expenseGroupId AND Budget_Month__c = :normalizedBudgetMonth
            WITH USER_MODE
            LIMIT 1
        ];

        return budgets.isEmpty() ? null : new BudgetDto(budgets[0]);
    }

    /**
     * Creates or updates a monthly budget after validating its owning context.
     *
     * @param request Budget values to persist.
     * @return The persisted monthly budget.
     */
    public static BudgetDto saveMonthlyBudget(BudgetSaveRequest request) {
        Date normalizedBudgetMonth = validateAndNormalizeMonth(request);
        Budget__c existingBudget = findBudgetForSave(request, normalizedBudgetMonth);

        try {
            Id savedBudgetId = existingBudget == null
                ? insertBudget(request, normalizedBudgetMonth)
                : updateBudget(existingBudget.Id, request);
            return getBudgetById(savedBudgetId);
        } catch (DmlException e) {
            throw handledException('Failed to save budget: ' + e.getMessage());
        }
    }

    /**
     * Deletes one accessible monthly budget.
     *
     * @param budgetId Budget record to delete.
     */
    public static void deleteMonthlyBudget(Id budgetId) {
        if (budgetId == null) {
            throw handledException('Budget Id is required for deletion.');
        }

        List<Budget__c> budgets = [
            SELECT Id
            FROM Budget__c
            WHERE Id = :budgetId
            WITH USER_MODE
            LIMIT 1
        ];
        if (budgets.isEmpty()) {
            throw handledException('Budget not found or already deleted.');
        }
        try {
            Database.delete(budgets[0], AccessLevel.USER_MODE);
        } catch (DmlException e) {
            throw handledException('Failed to delete budget: ' + e.getMessage());
        }
    }

    private static void requireExpenseGroupId(Id expenseGroupId) {
        if (expenseGroupId == null) {
            throw handledException('Expense Group Id is required.');
        }
    }

    private static Date normalizeBudgetMonth(Date budgetMonth) {
        if (budgetMonth == null) {
            throw handledException('Budget month is required.');
        }
        return budgetMonth.toStartOfMonth();
    }

    private static Date validateAndNormalizeMonth(BudgetSaveRequest request) {
        if (request == null) {
            throw handledException('Budget details are required.');
        }
        requireExpenseGroupId(request.expenseGroupId);
        Date normalizedBudgetMonth = normalizeBudgetMonth(request.budgetMonth);
        if (request.amount == null || request.amount <= 0) {
            throw handledException('Budget amount must be greater than zero.');
        }
        return normalizedBudgetMonth;
    }

    private static Budget__c findBudgetForSave(
        BudgetSaveRequest request,
        Date normalizedBudgetMonth
    ) {
        if (request.budgetId != null) {
            List<Budget__c> requestedBudgets = [
                SELECT Id, Expense_Group__c, Budget_Month__c
                FROM Budget__c
                WHERE Id = :request.budgetId
                WITH USER_MODE
                LIMIT 1
            ];
            if (requestedBudgets.isEmpty()) {
                throw handledException('Budget not found or already deleted.');
            }

            Budget__c requestedBudget = requestedBudgets[0];
            String persistedContextKey =
                String.valueOf(requestedBudget.Expense_Group__c) +
                '-' +
                String.valueOf(requestedBudget.Budget_Month__c);
            String requestedContextKey =
                String.valueOf(request.expenseGroupId) +
                '-' +
                String.valueOf(normalizedBudgetMonth);
            if (persistedContextKey != requestedContextKey) {
                throw handledException(
                    'Budget record does not match the requested expense group and month.'
                );
            }
            return requestedBudget;
        }

        lockExpenseGroupForInsert(request.expenseGroupId);
        List<Budget__c> matchingBudgets = [
            SELECT Id, Expense_Group__c, Budget_Month__c
            FROM Budget__c
            WHERE
                Expense_Group__c = :request.expenseGroupId
                AND Budget_Month__c = :normalizedBudgetMonth
            WITH USER_MODE
            LIMIT 1
        ];
        return matchingBudgets.isEmpty() ? null : matchingBudgets[0];
    }

    private static void lockExpenseGroupForInsert(Id expenseGroupId) {
        List<Expense_Group__c> expenseGroups = [
            SELECT Id
            FROM Expense_Group__c
            WHERE Id = :expenseGroupId
            WITH USER_MODE
            LIMIT 1
            FOR UPDATE
        ];
        if (expenseGroups.isEmpty()) {
            throw handledException('Expense Group not found or no longer accessible.');
        }
    }

    private static Id insertBudget(BudgetSaveRequest request, Date normalizedBudgetMonth) {
        Budget__c budget = new Budget__c(
            Expense_Group__c = request.expenseGroupId,
            Budget_Month__c = normalizedBudgetMonth,
            Amount__c = request.amount,
            Description__c = request.description
        );
        List<Budget__c> inserts = (List<Budget__c>) Security.stripInaccessible(
                AccessType.CREATABLE,
                new List<Budget__c>{ budget }
            )
            .getRecords();
        Database.insert(inserts, AccessLevel.USER_MODE);
        return inserts[0].Id;
    }

    private static Id updateBudget(Id budgetId, BudgetSaveRequest request) {
        Budget__c budgetUpdate = new Budget__c(
            Id = budgetId,
            Amount__c = request.amount,
            Description__c = request.description
        );
        List<Budget__c> updates = (List<Budget__c>) Security.stripInaccessible(
                AccessType.UPDATABLE,
                new List<Budget__c>{ budgetUpdate }
            )
            .getRecords();
        Database.update(updates, AccessLevel.USER_MODE);
        return budgetId;
    }

    private static BudgetDto getBudgetById(Id budgetId) {
        Budget__c budget = [
            SELECT Id, Expense_Group__c, Budget_Month__c, Amount__c, Description__c
            FROM Budget__c
            WHERE Id = :budgetId
            WITH USER_MODE
            LIMIT 1
        ];
        return new BudgetDto(budget);
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
