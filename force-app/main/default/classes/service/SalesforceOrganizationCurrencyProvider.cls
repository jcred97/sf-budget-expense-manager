/** Resolves the Salesforce corporate or single-currency organization currency. */
public inherited sharing class SalesforceOrganizationCurrencyProvider implements OrganizationCurrencyProvider {
    private static final String CORPORATE_CURRENCY_QUERY = 'SELECT IsoCode FROM CurrencyType WHERE IsCorporate = true LIMIT 1';

    @TestVisible
    private static Boolean multiCurrencyEnabledOverride;
    @TestVisible
    private static String corporateCurrencyCodeOverride;

    /**
     * Returns corporate currency in multi-currency orgs and the org default otherwise.
     *
     * @return Salesforce organization currency code.
     */
    public String getCurrencyCode() {
        String currencyCode;
        if (isMultiCurrencyOrganization()) {
            currencyCode = getCorporateCurrencyCode();
        } else {
            currencyCode = UserInfo.getDefaultCurrency();
        }
        return currencyCode;
    }

    private static Boolean isMultiCurrencyOrganization() {
        return multiCurrencyEnabledOverride == null
            ? UserInfo.isMultiCurrencyOrganization()
            : multiCurrencyEnabledOverride;
    }

    private static String getCorporateCurrencyCode() {
        if (corporateCurrencyCodeOverride != null) {
            return corporateCurrencyCodeOverride;
        }
        List<SObject> currencies = Database.query(
            CORPORATE_CURRENCY_QUERY,
            AccessLevel.SYSTEM_MODE
        );
        return (String) currencies[0].get('IsoCode');
    }
}
