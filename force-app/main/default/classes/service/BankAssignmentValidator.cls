/** Validates Bank assignments selected by Expenses and Recurring Expense templates. */
public inherited sharing class BankAssignmentValidator {
    private class ValidationContext {
        public Map<Id, Expense_Group_Bank__c> assignmentsById;
        public Map<Id, Category__c> categoriesById;

        /**
         * Creates one bulk-loaded validation context.
         *
         * @param assignmentsById Assignments keyed by record ID.
         * @param categoriesById Categories keyed by record ID.
         */
        public ValidationContext(
            Map<Id, Expense_Group_Bank__c> assignmentsById,
            Map<Id, Category__c> categoriesById
        ) {
            this.assignmentsById = assignmentsById;
            this.categoriesById = categoriesById;
        }
    }

    private class Selection {
        public SObject recordToValidate;
        public Id bankAssignmentId;
        public Id categoryId;
        public Boolean requireActive;
    }

    /**
     * Validates Bank assignment changes on Expense records.
     *
     * @param expenses New Expense record values.
     * @param oldExpenses Prior Expense values keyed by record ID.
     */
    public static void validateExpenses(
        List<Expense__c> expenses,
        Map<Id, Expense__c> oldExpenses
    ) {
        List<Selection> selections = new List<Selection>();
        for (Expense__c expense : expenses) {
            Expense__c oldExpense = oldExpenses?.get(expense.Id);
            if (requiresValidation(expense, oldExpense)) {
                selections.add(buildSelection(expense, oldExpense));
            }
        }
        validateSelections(selections);
    }

    /**
     * Validates Bank assignment and reactivation changes on Recurring Expense templates.
     *
     * @param recurringExpenses New Recurring Expense record values.
     * @param oldRecurringExpenses Prior Recurring Expense values keyed by record ID.
     */
    public static void validateRecurringExpenses(
        List<Recurring_Expense__c> recurringExpenses,
        Map<Id, Recurring_Expense__c> oldRecurringExpenses
    ) {
        List<Selection> selections = new List<Selection>();
        for (Recurring_Expense__c recurringExpense : recurringExpenses) {
            Recurring_Expense__c oldRecurringExpense = oldRecurringExpenses
                ?.get(recurringExpense.Id);
            if (requiresValidation(recurringExpense, oldRecurringExpense)) {
                selections.add(buildSelection(recurringExpense, oldRecurringExpense));
            }
        }
        validateSelections(selections);
    }

    private static Boolean requiresValidation(Expense__c expense, Expense__c oldExpense) {
        return expense.Bank_Assignment__c != null &&
            (oldExpense == null ||
            expense.Bank_Assignment__c != oldExpense.Bank_Assignment__c ||
            expense.Category__c != oldExpense.Category__c);
    }

    private static Boolean requiresValidation(
        Recurring_Expense__c recurringExpense,
        Recurring_Expense__c oldRecurringExpense
    ) {
        if (recurringExpense.Bank_Assignment__c == null) {
            return false;
        }
        return oldRecurringExpense == null ||
            recurringExpense.Bank_Assignment__c != oldRecurringExpense.Bank_Assignment__c ||
            recurringExpense.Category__c != oldRecurringExpense.Category__c ||
            (oldRecurringExpense.Active__c != true &&
            recurringExpense.Active__c == true);
    }

    private static Selection buildSelection(Expense__c expense, Expense__c oldExpense) {
        Selection selection = new Selection();
        selection.recordToValidate = expense;
        selection.bankAssignmentId = expense.Bank_Assignment__c;
        selection.categoryId = expense.Category__c;
        selection.requireActive =
            oldExpense == null ||
            expense.Bank_Assignment__c != oldExpense.Bank_Assignment__c;
        return selection;
    }

    private static Selection buildSelection(
        Recurring_Expense__c recurringExpense,
        Recurring_Expense__c oldRecurringExpense
    ) {
        Selection selection = new Selection();
        selection.recordToValidate = recurringExpense;
        selection.bankAssignmentId = recurringExpense.Bank_Assignment__c;
        selection.categoryId = recurringExpense.Category__c;
        selection.requireActive =
            oldRecurringExpense == null ||
            recurringExpense.Bank_Assignment__c != oldRecurringExpense.Bank_Assignment__c ||
            (oldRecurringExpense.Active__c != true &&
            recurringExpense.Active__c == true);
        return selection;
    }

    private static void validateSelections(List<Selection> selections) {
        if (selections.isEmpty()) {
            return;
        }
        ValidationContext context = loadContext(selections);
        for (Selection selection : selections) {
            validateSelection(selection, context);
        }
    }

    private static ValidationContext loadContext(List<Selection> selections) {
        Set<Id> assignmentIds = new Set<Id>();
        Set<Id> categoryIds = new Set<Id>();
        for (Selection selection : selections) {
            assignmentIds.add(selection.bankAssignmentId);
            categoryIds.add(selection.categoryId);
        }
        Map<Id, Expense_Group_Bank__c> assignmentsById = new Map<Id, Expense_Group_Bank__c>(
            [
                SELECT Id, Active__c, Bank__r.Active__c, Expense_Group__c
                FROM Expense_Group_Bank__c
                WHERE Id IN :assignmentIds
                WITH SYSTEM_MODE
            ]
        );
        Map<Id, Category__c> categoriesById = new Map<Id, Category__c>(
            [
                SELECT Id, Expense_Group__c
                FROM Category__c
                WHERE Id IN :categoryIds
                WITH SYSTEM_MODE
            ]
        );
        return new ValidationContext(assignmentsById, categoriesById);
    }

    private static void validateSelection(Selection selection, ValidationContext context) {
        Expense_Group_Bank__c assignment = context.assignmentsById.get(selection.bankAssignmentId);
        Category__c category = context.categoriesById.get(selection.categoryId);
        if (assignment == null) {
            selection.recordToValidate.addError('The selected Bank assignment does not exist.');
            return;
        }
        if (category == null || assignment.Expense_Group__c != category.Expense_Group__c) {
            selection.recordToValidate.addError(
                'Select a Bank assigned to the Category\'s Expense Group.'
            );
            return;
        }
        if (
            selection.requireActive &&
            (assignment.Active__c != true ||
            assignment.Bank__r?.Active__c != true)
        ) {
            selection.recordToValidate.addError('Select an active Bank assignment.');
        }
    }
}
