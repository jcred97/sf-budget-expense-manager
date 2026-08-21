/** User-mode Expense Group queries shared by Lightning entry points. */
public with sharing class ExpenseGroupSelector {
    private static final Integer MAX_WORKSPACE_RESULTS = 2000;

    /**
     * Returns the bounded Expense Group list used by the workspace selector.
     *
     * @return Expense Groups ordered by name.
     */
    public static List<Expense_Group__c> selectAllForWorkspace() {
        return [
            SELECT Id, Name
            FROM Expense_Group__c
            WITH USER_MODE
            ORDER BY Name
            LIMIT :MAX_WORKSPACE_RESULTS
        ];
    }
}
