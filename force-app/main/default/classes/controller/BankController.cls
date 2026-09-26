/** Lightning-facing controller for Expense Group Bank selectors. */
public with sharing class BankController {
    private static final Integer MAX_SELECTOR_RESULTS = 2000;

    /**
     * Returns active Banks explicitly assigned to the selected Expense Group.
     *
     * @param expenseGroupId Expense Group whose available Banks should be returned.
     * @return Available Bank options ordered by global Bank name.
     */
    @AuraEnabled
    public static List<ExpenseGroupBankOptionDto> getAvailableExpenseGroupBanks(Id expenseGroupId) {
        List<ExpenseGroupBankOptionDto> options = new List<ExpenseGroupBankOptionDto>();
        if (expenseGroupId == null) {
            return options;
        }

        for (Expense_Group_Bank__c assignment : [
            SELECT Id, Active__c, Bank__c, Bank__r.Name, Bank__r.Active__c, Expense_Group__c
            FROM Expense_Group_Bank__c
            WHERE Expense_Group__c = :expenseGroupId AND Active__c = TRUE AND Bank__r.Active__c = TRUE
            WITH USER_MODE
            ORDER BY Bank__r.Name ASC, CreatedDate ASC
            LIMIT :MAX_SELECTOR_RESULTS
        ]) {
            options.add(new ExpenseGroupBankOptionDto(assignment));
        }
        return options;
    }
}
