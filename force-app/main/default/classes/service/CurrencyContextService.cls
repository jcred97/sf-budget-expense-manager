/** Reads and validates the stable app reporting currency. */
public without sharing class CurrencyContextService {
    private static final String UNINITIALIZED_MESSAGE = 'The app base currency has not been initialized. Open Budget & Expense Manager Settings and refresh.';
    private static final String INVALID_STORED_CODE_MESSAGE = 'The app base currency must be a valid three-letter ISO currency code.';
    private static final String INVALID_ORG_CODE_MESSAGE = 'Salesforce did not return a valid three-letter organization currency code.';

    @TestVisible
    private static OrganizationCurrencyProvider currencyProvider = new SalesforceOrganizationCurrencyProvider();
    @TestVisible
    private static CurrencyContextDto cachedContext;

    /** Sanitized configuration failure safe to translate for Lightning clients. */
    public class CurrencyContextException extends Exception {
    }

    /**
     * Returns the persisted app currency without performing initialization or DML.
     *
     * @return Stable app currency context.
     */
    public static CurrencyContextDto getCurrencyContext() {
        if (cachedContext != null) {
            return cachedContext;
        }

        List<SObject> settingsRecords = Database.query(
            'SELECT Base_Currency_Code__c FROM Budget_Expense_Manager_Setting__c ' +
            'ORDER BY CreatedDate ASC LIMIT 1',
            AccessLevel.SYSTEM_MODE
        );
        if (
            settingsRecords.isEmpty() ||
            String.isBlank((String) settingsRecords[0].get('Base_Currency_Code__c'))
        ) {
            throw new CurrencyContextException(UNINITIALIZED_MESSAGE);
        }

        cachedContext = new CurrencyContextDto();
        cachedContext.baseCurrencyCode = normalizeStoredCurrencyCode(
            (String) settingsRecords[0].get('Base_Currency_Code__c')
        );
        cachedContext.multiCurrencyEnabled = UserInfo.isMultiCurrencyOrganization();
        return cachedContext;
    }

    /**
     * Resolves and validates the Salesforce organization currency for first-time initialization.
     *
     * @return Normalized three-letter organization currency code.
     */
    public static String resolveOrganizationCurrencyCode() {
        return normalizeCurrencyCode(currencyProvider.getCurrencyCode(), INVALID_ORG_CODE_MESSAGE);
    }

    @TestVisible
    private static String normalizeStoredCurrencyCode(String currencyCode) {
        return normalizeCurrencyCode(currencyCode, INVALID_STORED_CODE_MESSAGE);
    }

    private static String normalizeCurrencyCode(String currencyCode, String errorMessage) {
        String normalizedCode = currencyCode?.trim()?.toUpperCase();
        if (String.isBlank(normalizedCode) || !Pattern.matches('[A-Z]{3}', normalizedCode)) {
            throw new CurrencyContextException(errorMessage);
        }
        return normalizedCode;
    }
}
