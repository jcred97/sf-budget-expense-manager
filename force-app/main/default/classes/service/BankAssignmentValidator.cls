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
        public String transactionType;
        public String legacyBank;
        public Id generatedSourceId;
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
        return oldExpense == null ||
            expense.Bank_Assignment__c != oldExpense.Bank_Assignment__c ||
            expense.Category__c != oldExpense.Category__c ||
            expense.Transaction_Type__c != oldExpense.Transaction_Type__c ||
            expense.Bank__c != oldExpense.Bank__c;
    }

    private static Boolean requiresValidation(
        Recurring_Expense__c recurringExpense,
        Recurring_Expense__c oldRecurringExpense
    ) {
        return oldRecurringExpense == null ||
            recurringExpense.Bank_Assignment__c != oldRecurringExpense.Bank_Assignment__c ||
            recurringExpense.Category__c != oldRecurringExpense.Category__c ||
            recurringExpense.Transaction_Type__c != oldRecurringExpense.Transaction_Type__c ||
            recurringExpense.Bank__c != oldRecurringExpense.Bank__c ||
            (oldRecurringExpense.Active__c != true &&
            recurringExpense.Active__c == true);
    }

    private static Selection buildSelection(Expense__c expense, Expense__c oldExpense) {
        Selection selection = new Selection();
        selection.recordToValidate = expense;
        selection.bankAssignmentId = expense.Bank_Assignment__c;
        selection.categoryId = expense.Category__c;
        selection.transactionType = expense.Transaction_Type__c;
        selection.legacyBank = expense.Bank__c;
        if (oldExpense == null && expense.Id == null) {
            selection.generatedSourceId = expense.Recurring_Expense__c;
        }
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
        selection.transactionType = recurringExpense.Transaction_Type__c;
        selection.legacyBank = recurringExpense.Bank__c;
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
        List<Selection> assignedSelections = new List<Selection>();
        Map<Id, Recurring_Expense__c> generationSources = loadHistoricalGenerationSources(selections);
        for (Selection selection : selections) {
            if (selection.bankAssignmentId != null) {
                assignedSelections.add(selection);
            } else if (selection.transactionType == 'Cash' && !String.isBlank(selection.legacyBank)) {
                if (!hasHistoricalGenerationSource(selection, generationSources)) {
                    selection.recordToValidate.addError('Cash requires No bank. Clear the Bank selection or choose a supported payment method.');
                }
            } else if (!isCashOrBlank(selection.transactionType) && String.isBlank(selection.legacyBank)) {
                if (!hasHistoricalGenerationSource(selection, generationSources)) {
                    selection.recordToValidate.addError('Select a Bank assignment for this transaction type, or choose Cash.');
                }
            }
        }
        if (assignedSelections.isEmpty()) {
            return;
        }
        ValidationContext context = loadContext(assignedSelections);
        for (Selection selection : assignedSelections) {
            validateSelection(selection, context, generationSources);
        }
    }

    private static Boolean hasHistoricalGenerationSource(Selection selection, Map<Id, Recurring_Expense__c> sources) {
        return selection.generatedSourceId != null &&
            matchesHistoricalGenerationSource((Expense__c) selection.recordToValidate, sources.get(selection.generatedSourceId));
    }

    private static Map<Id, Recurring_Expense__c> loadHistoricalGenerationSources(List<Selection> selections) {
        Set<Id> sourceIds = new Set<Id>();
        for (Selection selection : selections) {
            if (
                selection.generatedSourceId != null &&
                ((selection.bankAssignmentId == null && !isCashOrBlank(selection.transactionType) && String.isBlank(selection.legacyBank)) ||
                ((selection.bankAssignmentId != null || !String.isBlank(selection.legacyBank)) && isCashOrBlank(selection.transactionType)))
            ) {
                sourceIds.add(selection.generatedSourceId);
            }
        }
        if (sourceIds.isEmpty()) {
            return new Map<Id, Recurring_Expense__c>();
        }
        return new Map<Id, Recurring_Expense__c>([
            SELECT Id, Active__c, Category__c, Bank_Assignment__c, Bank__c, Transaction_Type__c
            FROM Recurring_Expense__c
            WHERE Id IN :sourceIds AND Active__c = TRUE
            WITH SYSTEM_MODE
        ]);
    }

    // Preserve generation from pre-feature active templates without exempting new user selections.
    @TestVisible
    private static Boolean matchesHistoricalGenerationSource(Expense__c expense, Recurring_Expense__c source) {
        return expense.Id == null && source != null && source.Id != null &&
            expense.Recurring_Expense__c == source.Id && source.Active__c == true &&
            expense.Category__c == source.Category__c && source.Category__c != null &&
            expense.Bank_Assignment__c == source.Bank_Assignment__c && expense.Bank__c == source.Bank__c &&
            expense.Transaction_Type__c == source.Transaction_Type__c &&
            ((expense.Bank_Assignment__c == null && String.isBlank(expense.Bank__c) && !isCashOrBlank(expense.Transaction_Type__c)) ||
            ((expense.Bank_Assignment__c != null || !String.isBlank(expense.Bank__c)) && isCashOrBlank(expense.Transaction_Type__c)));
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
                SELECT Id, Active__c, Bank__r.Active__c, Expense_Group__c,
                    Supported_Credit_Card__c, Supported_Debit_Card__c,
                    Supported_Bank_Payment__c, Supported_Bank_Transfer__c
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

    private static void validateSelection(Selection selection, ValidationContext context, Map<Id, Recurring_Expense__c> generationSources) {
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
            return;
        }
        if (isCashOrBlank(selection.transactionType) && hasHistoricalGenerationSource(selection, generationSources)) {
            return;
        }
        if (selection.transactionType == 'Cash') {
            selection.recordToValidate.addError('Cash requires No bank. Clear the Bank selection or choose a supported payment method.');
        } else if (String.isBlank(selection.transactionType)) {
            selection.recordToValidate.addError('Select a supported payment method for this Bank assignment.');
        } else if (!supportsTransactionType(assignment, selection.transactionType)) {
            selection.recordToValidate.addError('The selected Bank assignment does not support ' + selection.transactionType + '.');
        }
    }

    private static Boolean isCashOrBlank(String transactionType) {
        return String.isBlank(transactionType) || transactionType == 'Cash';
    }

    /** Returns whether an assignment permits one of the four configured Bank payment methods. */
    public static Boolean supportsTransactionType(Expense_Group_Bank__c assignment, String transactionType) {
        switch on transactionType {
            when 'Credit Card' { return assignment.Supported_Credit_Card__c == true; }
            when 'Debit Card' { return assignment.Supported_Debit_Card__c == true; }
            when 'Bank Payment' { return assignment.Supported_Bank_Payment__c == true; }
            when 'Bank Transfer' { return assignment.Supported_Bank_Transfer__c == true; }
            when else { return false; }
        }
    }
}
