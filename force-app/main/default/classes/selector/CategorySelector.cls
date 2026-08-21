/** User-mode Category queries shared by Lightning entry points. */
public with sharing class CategorySelector {
    private static final Integer MAX_WORKSPACE_RESULTS = 2000;

    /**
     * Returns Categories for one Expense Group, or a bounded compatibility list when no group is supplied.
     *
     * @param expenseGroupId Optional Expense Group record ID.
     * @return Categories ordered by name.
     */
    public static List<Category__c> selectByExpenseGroup(Id expenseGroupId) {
        if (expenseGroupId == null) {
            return [
                SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
                FROM Category__c
                WITH USER_MODE
                ORDER BY Name
                LIMIT :MAX_WORKSPACE_RESULTS
            ];
        }

        return [
            SELECT Id, Name, Expense_Group__c, Expense_Group__r.Name
            FROM Category__c
            WHERE Expense_Group__c = :expenseGroupId
            WITH USER_MODE
            ORDER BY Name
        ];
    }
}
