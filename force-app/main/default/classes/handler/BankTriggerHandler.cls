/** Normalizes global Bank records and protects active group assignments. */
public inherited sharing class BankTriggerHandler {
    /**
     * Routes supported Bank trigger operations.
     *
     * @param operation Current trigger operation.
     * @param banks New Bank record values.
     * @param oldBanks Prior Bank values keyed by record ID.
     */
    public static void run(
        System.TriggerOperation operation,
        List<Bank__c> banks,
        Map<Id, Bank__c> oldBanks
    ) {
        normalizeBanks(banks);
        if (operation == System.TriggerOperation.BEFORE_UPDATE) {
            blockDeactivationWithActiveAssignments(banks, oldBanks);
        }
    }

    private static void normalizeBanks(List<Bank__c> banks) {
        for (Bank__c bank : banks) {
            String normalizedName = normalizeName(bank.Name);
            if (String.isBlank(normalizedName)) {
                bank.addError('Bank Name is required.');
                continue;
            }
            bank.Name = normalizedName;
            bank.Bank_Key__c = normalizedName.toLowerCase();
        }
    }

    private static void blockDeactivationWithActiveAssignments(
        List<Bank__c> banks,
        Map<Id, Bank__c> oldBanks
    ) {
        Set<Id> deactivatedBankIds = new Set<Id>();
        for (Bank__c bank : banks) {
            Bank__c oldBank = oldBanks.get(bank.Id);
            if (oldBank.Active__c == true && bank.Active__c != true) {
                deactivatedBankIds.add(bank.Id);
            }
        }
        if (deactivatedBankIds.isEmpty()) {
            return;
        }

        Set<Id> bankIdsWithActiveAssignments = new Set<Id>();
        for (Expense_Group_Bank__c assignment : [
            SELECT Bank__c
            FROM Expense_Group_Bank__c
            WHERE Bank__c IN :deactivatedBankIds AND Active__c = TRUE
            WITH SYSTEM_MODE
        ]) {
            bankIdsWithActiveAssignments.add(assignment.Bank__c);
        }
        for (Bank__c bank : banks) {
            if (bankIdsWithActiveAssignments.contains(bank.Id)) {
                bank.addError(
                    'Deactivate this Bank in every Expense Group before deactivating the global Bank.'
                );
            }
        }
    }

    private static String normalizeName(String bankName) {
        return String.isBlank(bankName) ? null : bankName.trim().replaceAll('\\s+', ' ');
    }
}
