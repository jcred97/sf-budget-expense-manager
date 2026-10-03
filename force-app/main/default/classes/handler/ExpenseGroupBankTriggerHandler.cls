/** Maintains Expense Group Bank assignment invariants. */
public inherited sharing class ExpenseGroupBankTriggerHandler {
    /**
     * Routes supported Expense Group Bank trigger operations.
     *
     * @param operation Current trigger operation.
     * @param assignments New assignment record values.
     * @param oldAssignments Prior assignment values keyed by record ID.
     */
    public static void run(
        System.TriggerOperation operation,
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        normalizeAssignments(assignments);
        validateActiveBanks(assignments, oldAssignments);
        if (operation == System.TriggerOperation.BEFORE_UPDATE) {
            enforceImmutableRelationships(assignments, oldAssignments);
            blockDeactivationWithActiveTemplates(assignments, oldAssignments);
            blockUnsupportedMethodsWithActiveTemplates(assignments, oldAssignments);
        }
    }

    private static void normalizeAssignments(List<Expense_Group_Bank__c> assignments) {
        for (Expense_Group_Bank__c assignment : assignments) {
            if (assignment.Expense_Group__c == null || assignment.Bank__c == null) {
                assignment.addError('Expense Group and Bank are required.');
                continue;
            }
            assignment.Expense_Group_Bank_Key__c =
                String.valueOf(assignment.Expense_Group__c) +
                '-' +
                String.valueOf(assignment.Bank__c);
        }
    }

    private static void validateActiveBanks(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        Set<Id> bankIdsToValidate = getBankIdsToValidate(assignments, oldAssignments);
        if (bankIdsToValidate.isEmpty()) {
            return;
        }

        Map<Id, Bank__c> banksById = new Map<Id, Bank__c>(
            [
                SELECT Id, Active__c
                FROM Bank__c
                WHERE Id IN :bankIdsToValidate
                WITH SYSTEM_MODE
            ]
        );
        applyInactiveBankErrors(assignments, oldAssignments, banksById);
    }

    private static Set<Id> getBankIdsToValidate(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        Set<Id> bankIds = new Set<Id>();
        for (Expense_Group_Bank__c assignment : assignments) {
            Expense_Group_Bank__c oldAssignment = oldAssignments?.get(assignment.Id);
            if (requiresActiveBankValidation(assignment, oldAssignment)) {
                bankIds.add(assignment.Bank__c);
            }
        }
        return bankIds;
    }

    private static Boolean requiresActiveBankValidation(
        Expense_Group_Bank__c assignment,
        Expense_Group_Bank__c oldAssignment
    ) {
        return isNewOrReactivated(assignment, oldAssignment) &&
            assignment.Active__c == true &&
            assignment.Bank__c != null;
    }

    private static Boolean isNewOrReactivated(
        Expense_Group_Bank__c assignment,
        Expense_Group_Bank__c oldAssignment
    ) {
        return oldAssignment == null ||
            (oldAssignment.Active__c != true &&
            assignment.Active__c == true);
    }

    private static void applyInactiveBankErrors(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments,
        Map<Id, Bank__c> banksById
    ) {
        for (Expense_Group_Bank__c assignment : assignments) {
            Expense_Group_Bank__c oldAssignment = oldAssignments?.get(assignment.Id);
            if (!requiresActiveBankValidation(assignment, oldAssignment)) {
                continue;
            }
            Bank__c bank = banksById.get(assignment.Bank__c);
            if (bank == null || bank.Active__c != true) {
                assignment.addError(
                    'Only an active global Bank can be assigned to an Expense Group.'
                );
            }
        }
    }

    private static void enforceImmutableRelationships(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        for (Expense_Group_Bank__c assignment : assignments) {
            Expense_Group_Bank__c oldAssignment = oldAssignments.get(assignment.Id);
            if (
                assignment.Expense_Group__c != oldAssignment.Expense_Group__c ||
                assignment.Bank__c != oldAssignment.Bank__c
            ) {
                assignment.addError(
                    'Expense Group and Bank cannot be changed. Deactivate this assignment and create another one.'
                );
            }
        }
    }

    private static void blockUnsupportedMethodsWithActiveTemplates(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        Map<Id, Expense_Group_Bank__c> changedAssignments = new Map<Id, Expense_Group_Bank__c>();
        for (Expense_Group_Bank__c assignment : assignments) {
            Expense_Group_Bank__c oldAssignment = oldAssignments.get(assignment.Id);
            if (
                (oldAssignment.Supported_Credit_Card__c == true && assignment.Supported_Credit_Card__c != true) ||
                (oldAssignment.Supported_Debit_Card__c == true && assignment.Supported_Debit_Card__c != true) ||
                (oldAssignment.Supported_Bank_Payment__c == true && assignment.Supported_Bank_Payment__c != true) ||
                (oldAssignment.Supported_Bank_Transfer__c == true && assignment.Supported_Bank_Transfer__c != true)
            ) {
                changedAssignments.put(assignment.Id, assignment);
            }
        }
        if (changedAssignments.isEmpty()) {
            return;
        }
        Set<Id> blockedIds = new Set<Id>();
        for (Recurring_Expense__c template : [
            SELECT Bank_Assignment__c, Transaction_Type__c
            FROM Recurring_Expense__c
            WHERE Bank_Assignment__c IN :changedAssignments.keySet() AND Active__c = TRUE
            WITH SYSTEM_MODE
        ]) {
            if (
                BankAssignmentValidator.supportsTransactionType(oldAssignments.get(template.Bank_Assignment__c), template.Transaction_Type__c) &&
                !BankAssignmentValidator.supportsTransactionType(changedAssignments.get(template.Bank_Assignment__c), template.Transaction_Type__c)
            ) {
                blockedIds.add(template.Bank_Assignment__c);
            }
        }
        for (Id assignmentId : blockedIds) {
            changedAssignments.get(assignmentId).addError(
                'Deactivate or change active recurring expenses before disabling a payment method they use.'
            );
        }
    }

    private static void blockDeactivationWithActiveTemplates(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        Set<Id> deactivatedAssignmentIds = new Set<Id>();
        for (Expense_Group_Bank__c assignment : assignments) {
            Expense_Group_Bank__c oldAssignment = oldAssignments.get(assignment.Id);
            if (oldAssignment.Active__c == true && assignment.Active__c != true) {
                deactivatedAssignmentIds.add(assignment.Id);
            }
        }
        if (deactivatedAssignmentIds.isEmpty()) {
            return;
        }

        Set<Id> assignmentIdsWithActiveTemplates = new Set<Id>();
        for (Recurring_Expense__c recurringExpense : [
            SELECT Bank_Assignment__c
            FROM Recurring_Expense__c
            WHERE Bank_Assignment__c IN :deactivatedAssignmentIds AND Active__c = TRUE
            WITH SYSTEM_MODE
        ]) {
            assignmentIdsWithActiveTemplates.add(recurringExpense.Bank_Assignment__c);
        }
        for (Expense_Group_Bank__c assignment : assignments) {
            if (assignmentIdsWithActiveTemplates.contains(assignment.Id)) {
                assignment.addError(
                    'Deactivate or move active recurring expenses before deactivating this Bank assignment.'
                );
            }
        }
    }
}
