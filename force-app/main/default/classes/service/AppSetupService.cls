/** Narrow system access exposes readiness only and initializes settings after explicit authorization. */
public without sharing class AppSetupService {
    private static final String SETUP_PERMISSION = 'Manage_App_Setup';
    private static final String SINGLETON_KEY = 'Default';

    /** Reads configuration without creating settings, locking currency, or scheduling jobs. */
    public static AppSetupStatus getSetupStatus() {
        return buildStatus(readSettings(false), FeatureManagement.checkPermission(SETUP_PERMISSION));
    }

    /** Authorizes a confirmed, idempotent first-time initialization; existing installs remain unchanged. */
    public static AppSetupStatus completeSetup(Boolean confirmed) {
        if (!FeatureManagement.checkPermission(SETUP_PERMISSION)) {
            throw handled('An app administrator must complete setup.');
        }
        if (confirmed != true) {
            throw handled('Confirm the reporting currency before completing setup.');
        }
        List<Budget_Expense_Manager_Setting__c> records = readSettings(true);
        AppSetupStatus status = buildStatus(records, true);
        if (status.ready) {
            return status;
        }
        if (!status.canCompleteSetup) {
            throw handled(status.message);
        }
        if (records.isEmpty()) {
            Budget_Expense_Manager_Setting__c created = new Budget_Expense_Manager_Setting__c(
                Name = 'Default',
                Singleton_Key__c = SINGLETON_KEY,
                Base_Currency_Code__c = 'PHP',
                Recurring_Expenses_Enabled__c = false,
                Global_Recurring_Run_Time__c = Time.newInstance(8, 0, 0, 0)
            );
            try {
                Database.insert(created, AccessLevel.SYSTEM_MODE);
                records.add(created);
            } catch (DmlException collision) {
                return recoverCreationCollision(collision);
            }
        } else {
            initializeExisting(records[0]);
        }
        return buildStatus(readSettings(false), true);
    }

    @TestVisible
    private static AppSetupStatus recoverCreationCollision(DmlException collision) {
        if (!isCreationCollision(collision)) {
            throw handled('Unable to complete setup. ' + collision.getDmlMessage(0));
        }
        // A competing administrator may have committed the singleton while this request waited.
        List<Budget_Expense_Manager_Setting__c> records = readSettings(true);
        if (records.isEmpty()) {
            throw handled('Setup is already being initialized. Refresh and try again.');
        }
        AppSetupStatus status = buildStatus(records, true);
        if (status.ready) {
            return status;
        }
        if (!status.canCompleteSetup) {
            throw handled(status.message);
        }
        initializeExisting(records[0]);
        return buildStatus(readSettings(false), true);
    }

    /** Used by app endpoints to avoid implicit first-time initialization. */
    public static void requireReady() {
        if (!getSetupStatus().ready) {
            throw handled('An app administrator must complete first-time setup before opening Settings.');
        }
    }

    private static void initializeExisting(Budget_Expense_Manager_Setting__c settings) {
        // The caller holds this row lock and has checked the detected currency before the immutable write.
        Database.update(
            new Budget_Expense_Manager_Setting__c(Id = settings.Id, Base_Currency_Code__c = 'PHP', Singleton_Key__c = SINGLETON_KEY),
            AccessLevel.SYSTEM_MODE
        );
    }

    private static List<Budget_Expense_Manager_Setting__c> readSettings(Boolean lockRows) {
        String query = 'SELECT Id, Base_Currency_Code__c FROM Budget_Expense_Manager_Setting__c ';
        query += lockRows ? 'LIMIT 2 FOR UPDATE' : 'ORDER BY CreatedDate ASC LIMIT 2';
        return Database.query(query, AccessLevel.SYSTEM_MODE);
    }

    @TestVisible
    private static AppSetupStatus buildStatus(List<Budget_Expense_Manager_Setting__c> records, Boolean canManage) {
        AppSetupStatus status = new AppSetupStatus();
        status.canManageSetup = canManage;
        if (records.size() > 1) {
            status.message = canManage
                ? 'Multiple settings records exist. An administrator must resolve the configuration before setup.'
                : 'An app administrator needs to finish setup.';
            return status;
        }
        if (!records.isEmpty() && !String.isBlank(records[0].Base_Currency_Code__c)) {
            String storedCurrency = records[0].Base_Currency_Code__c;
            if (Pattern.matches('[A-Z]{3}', storedCurrency)) {
                status.ready = true;
                status.baseCurrencyCode = storedCurrency;
                status.message = 'App setup is complete.';
            } else {
                status.message = 'The stored reporting currency is invalid. Contact an app administrator.';
            }
            return status;
        }
        if (!canManage) {
            status.message = 'An app administrator needs to finish setup.';
            return status;
        }
        try {
            status.organizationCurrencyCode = CurrencyContextService.resolveOrganizationCurrencyCode();
        } catch (CurrencyContextService.CurrencyContextException currencyError) {
            status.message = currencyError.getMessage();
            return status;
        }
        Boolean multiCurrency = UserInfo.isMultiCurrencyOrganization();
        status.canCompleteSetup = supportsNewSetup(status.organizationCurrencyCode, multiCurrency);
        status.message = status.canCompleteSetup
            ? 'Confirm PHP as the fixed reporting currency. Recurring automation can be enabled later in Settings.'
            : multiCurrency
                  ? 'This version supports single-currency PHP organizations. Multi-currency setup is not supported.'
                  : 'This version supports PHP reporting. The Salesforce organization currency is ' +
                    status.organizationCurrencyCode +
                    '. Setup cannot continue.';
        return status;
    }

    @TestVisible
    private static Boolean supportsNewSetup(String organizationCurrency, Boolean multiCurrency) {
        return organizationCurrency == 'PHP' && multiCurrency == false;
    }

    private static Boolean isCreationCollision(DmlException error) {
        return error.getDmlStatusCode(0) == 'DUPLICATE_VALUE' ||
            (error.getDmlStatusCode(0) == 'FIELD_CUSTOM_VALIDATION_EXCEPTION' &&
            error.getDmlMessage(0).contains('Only one Budget & Expense Manager settings record can exist.'));
    }

    private static AuraHandledException handled(String message) {
        AuraHandledException error = new AuraHandledException(message);
        error.setMessage(message);
        return error;
    }
}
