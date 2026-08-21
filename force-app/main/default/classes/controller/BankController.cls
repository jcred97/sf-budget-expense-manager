/** Lightning-facing controller for Expense Group Bank selectors. */
public with sharing class BankController {
    /**
     * Returns active Banks explicitly assigned to the selected Expense Group.
     *
     * @param expenseGroupId Expense Group whose available Banks should be returned.
     * @return Available Bank options ordered by global Bank name.
     */
    @AuraEnabled
    public static List<ExpenseGroupBankOptionDto> getAvailableExpenseGroupBanks(Id expenseGroupId) {
        return BankService.getAvailableExpenseGroupBanks(expenseGroupId);
    }
}
