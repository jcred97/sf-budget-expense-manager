/** Lightning-safe representation of the app's stable reporting currency. */
public class CurrencyContextDto {
    /** Stable three-letter currency used for app totals and reporting. */
    @AuraEnabled
    public String baseCurrencyCode;

    /** Whether Salesforce multi-currency is currently enabled for the organization. */
    @AuraEnabled
    public Boolean multiCurrencyEnabled;
}
