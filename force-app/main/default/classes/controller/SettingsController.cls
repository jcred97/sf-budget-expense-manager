/** Lightning-facing controller for global Budget & Expense Manager settings. */
public with sharing class SettingsController {
    /**
     * Returns the current settings and recurring scheduler state.
     *
     * @return Settings state for the current user.
     */
    @AuraEnabled
    public static BudgetExpenseSettingsState getSettings() {
        return BudgetExpenseSettingsService.getSettings();
    }

    /**
     * Saves global recurring settings and returns the current scheduler state.
     *
     * @param request Updated enablement and daily run-time values.
     * @return Persisted settings and current scheduler state.
     */
    @AuraEnabled
    public static BudgetExpenseSettingsState saveSettings(
        BudgetExpenseSettingsUpdateRequest request
    ) {
        return BudgetExpenseSettingsService.saveSettings(request);
    }
}
