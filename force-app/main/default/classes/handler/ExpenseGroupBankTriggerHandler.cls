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
        applyInactiveBankErrors(assignments, bankIdsToValidate, banksById);
    }

    private static Set<Id> getBankIdsToValidate(
        List<Expense_Group_Bank__c> assignments,
        Map<Id, Expense_Group_Bank__c> oldAssignments
    ) {
        Set<Id> bankIds = new Set<Id>();
        for (Expense_Group_Bank__c assignment : assignments) {
            Expense_Group_Bank__c oldAssignment = oldAssignments?.get(assignment.Id);
            if (
                isNewOrReactivated(assignment, oldAssignment) &&
                assignment.Active__c == true &&
                assignment.Bank__c != null
            ) {
                bankIds.add(assignment.Bank__c);
            }
        }
        return bankIds;
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
        Set<Id> bankIdsToValidate,
        Map<Id, Bank__c> banksById
    ) {
        for (Expense_Group_Bank__c assignment : assignments) {
            if (!bankIdsToValidate.contains(assignment.Bank__c)) {
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
