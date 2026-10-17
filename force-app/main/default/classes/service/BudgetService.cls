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
        Date normalizedBudgetMonth = normalizeBudgetContext(expenseGroupId, budgetMonth);
        requireBudgetReadAccess();
        List<Budget__c> budgets = Database.queryWithBinds(
            budgetProjection() + ' WHERE Expense_Group__c = :groupId AND Budget_Month__c = :month LIMIT 1',
            new Map<String, Object>{ 'groupId' => expenseGroupId, 'month' => normalizedBudgetMonth },
            AccessLevel.USER_MODE
        );

        return budgets.isEmpty() ? null : toDto(budgets[0]);
    }

    /**
     * Returns the optional budgets in a bounded six-month reporting window.
     *
     * @param expenseGroupId Expense group that owns the budgets.
     * @param endMonth Any date in the final calendar month of the window.
     * @return Accessible budgets ordered from oldest to newest month.
     */
    public static List<BudgetDto> getBudgetHistory(Id expenseGroupId, Date endMonth) {
        Date normalizedEndMonth = normalizeBudgetContext(expenseGroupId, endMonth);
        Date startMonth = normalizedEndMonth.addMonths(-5);
        List<BudgetDto> history = new List<BudgetDto>();

        requireBudgetReadAccess();
        List<Budget__c> budgets = Database.queryWithBinds(
            budgetProjection() +
            ' WHERE Expense_Group__c = :groupId AND Budget_Month__c >= :startMonth AND Budget_Month__c <= :endMonth ORDER BY Budget_Month__c ASC LIMIT 6',
            new Map<String, Object>{ 'groupId' => expenseGroupId, 'startMonth' => startMonth, 'endMonth' => normalizedEndMonth },
            AccessLevel.USER_MODE
        );
        for (Budget__c budget : budgets) {
            history.add(toDto(budget));
        }
        return history;
    }

    /**
     * Creates or updates a monthly budget after validating its owning context.
     *
     * @param request Budget values to persist.
     * @return The persisted monthly budget.
     */
    public static BudgetDto saveMonthlyBudget(BudgetSaveRequest request) {
        Date normalizedBudgetMonth = validateAndNormalizeMonth(request);
        requireBudgetReadAccess();
        Budget__c existingBudget = findBudgetForSave(request, normalizedBudgetMonth);

        try {
            if (existingBudget == null) {
                insertBudget(request, normalizedBudgetMonth);
            } else {
                updateBudget(existingBudget.Id, request);
            }
            return getMonthlyBudget(request.expenseGroupId, normalizedBudgetMonth);
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

        AppAccessChecks.requireDelete(Budget__c.SObjectType);
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

    private static Date normalizeBudgetContext(Id expenseGroupId, Date budgetMonth) {
        if (expenseGroupId == null) {
            throw handledException('Expense Group Id is required.');
        }
        if (budgetMonth == null) {
            throw handledException('Budget month is required.');
        }
        return budgetMonth.toStartOfMonth();
    }

    private static Date validateAndNormalizeMonth(BudgetSaveRequest request) {
        if (request == null) {
            throw handledException('Budget details are required.');
        }
        Date normalizedBudgetMonth = normalizeBudgetContext(request.expenseGroupId, request.budgetMonth);
        if (request.amount == null || request.amount <= 0) {
            throw handledException('Budget amount must be greater than zero.');
        }
        return normalizedBudgetMonth;
    }

    private static Budget__c findBudgetForSave(BudgetSaveRequest request, Date normalizedBudgetMonth) {
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
            String requestedContextKey = String.valueOf(request.expenseGroupId) + '-' + String.valueOf(normalizedBudgetMonth);
            if (persistedContextKey != requestedContextKey) {
                throw handledException('Budget record does not match the requested expense group and month.');
            }
            return requestedBudget;
        }

        lockExpenseGroupForInsert(request.expenseGroupId);
        List<Budget__c> matchingBudgets = [
            SELECT Id, Expense_Group__c, Budget_Month__c
            FROM Budget__c
            WHERE Expense_Group__c = :request.expenseGroupId AND Budget_Month__c = :normalizedBudgetMonth
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

    private static void insertBudget(BudgetSaveRequest request, Date normalizedBudgetMonth) {
        AppAccessChecks.requireCreate(Budget__c.SObjectType);
        AppAccessChecks.requireCreateable(
            new List<Schema.SObjectField>{ Budget__c.Expense_Group__c, Budget__c.Budget_Month__c, Budget__c.Amount__c }
        );
        Budget__c budget = new Budget__c(
            Expense_Group__c = request.expenseGroupId,
            Budget_Month__c = normalizedBudgetMonth,
            Amount__c = request.amount
        );
        if (request.descriptionProvided != false) {
            AppAccessChecks.requireCreateable(new List<Schema.SObjectField>{ Budget__c.Description__c });
            budget.Description__c = request.description;
        }
        Database.insert(budget, AccessLevel.USER_MODE);
    }

    private static void updateBudget(Id budgetId, BudgetSaveRequest request) {
        AppAccessChecks.requireUpdate(Budget__c.SObjectType);
        AppAccessChecks.requireUpdateable(new List<Schema.SObjectField>{ Budget__c.Amount__c });
        Budget__c budgetUpdate = new Budget__c(Id = budgetId, Amount__c = request.amount);
        if (request.descriptionProvided != false) {
            AppAccessChecks.requireUpdateable(new List<Schema.SObjectField>{ Budget__c.Description__c });
            budgetUpdate.Description__c = request.description;
        }
        Database.update(budgetUpdate, AccessLevel.USER_MODE);
    }

    private static void requireBudgetReadAccess() {
        AppAccessChecks.requireRead(Budget__c.SObjectType);
        AppAccessChecks.requireReadable(
            new List<Schema.SObjectField>{ Budget__c.Expense_Group__c, Budget__c.Budget_Month__c, Budget__c.Amount__c }
        );
    }

    private static String budgetProjection() {
        return 'SELECT Id, Expense_Group__c, Budget_Month__c, Amount__c' +
            (Budget__c.Description__c.getDescribe().isAccessible() ? ', Description__c' : '') +
            ' FROM Budget__c';
    }

    private static BudgetDto toDto(Budget__c budget) {
        if (!Budget__c.Description__c.getDescribe().isAccessible()) {
            budget.Description__c = null;
        }
        return new BudgetDto(budget);
    }

    private static AuraHandledException handledException(String message) {
        AuraHandledException exceptionToThrow = new AuraHandledException(message);
        exceptionToThrow.setMessage(message);
        return exceptionToThrow;
    }
}
