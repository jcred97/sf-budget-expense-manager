@IsTest
private class CurrencyContextServiceTest {
    private static final String TEST_BASE_CURRENCY = 'AUD';
    private static final String MISSING_CURRENCY_MESSAGE = 'The app base currency has not been initialized. Open Budget & Expense Manager Settings and refresh.';
    private static final String INVALID_CURRENCY_MESSAGE = 'The app base currency must be a valid three-letter ISO currency code.';
    private static final String INVALID_ORGANIZATION_CURRENCY_MESSAGE = 'Salesforce did not return a valid three-letter organization currency code.';

    private class StubOrganizationCurrencyProvider implements OrganizationCurrencyProvider {
        private String currencyCode;

        StubOrganizationCurrencyProvider(String currencyCode) {
            this.currencyCode = currencyCode;
        }

        /**
         * Returns the configured organization currency code.
         *
         * @return Configured organization currency code.
         */
        public String getCurrencyCode() {
            return currencyCode;
        }
    }

    @IsTest
    static void testResolvesCurrencyThroughProviderBoundary() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CurrencyContextService.currencyProvider = new StubOrganizationCurrencyProvider(
                ' ' + TEST_BASE_CURRENCY.toLowerCase() + ' '
            );

            Test.startTest();
            String resolvedCurrency = CurrencyContextService.resolveOrganizationCurrencyCode();
            Test.stopTest();

            System.assertEquals(
                TEST_BASE_CURRENCY,
                resolvedCurrency,
                'Organization currency resolution should delegate through the replaceable provider.'
            );
        }
    }

    @IsTest
    static void testRejectsInvalidOrganizationCurrency() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            CurrencyContextService.currencyProvider = new StubOrganizationCurrencyProvider('A1!');

            try {
                CurrencyContextService.resolveOrganizationCurrencyCode();
                System.assert(false, 'Expected an invalid organization currency to be rejected.');
            } catch (CurrencyContextService.CurrencyContextException exceptionToCheck) {
                System.assertEquals(
                    INVALID_ORGANIZATION_CURRENCY_MESSAGE,
                    exceptionToCheck.getMessage(),
                    'Invalid provider values should fail with a stable configuration error.'
                );
            }
        }
    }

    @IsTest
    static void testSalesforceProviderReturnsOrganizationCurrency() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            String organizationCurrency = new SalesforceOrganizationCurrencyProvider()
                .getCurrencyCode();

            System.assert(
                Pattern.matches('[A-Z]{3}', organizationCurrency),
                'The Salesforce provider should return a three-letter organization currency.'
            );
            if (!UserInfo.isMultiCurrencyOrganization()) {
                System.assertEquals(
                    UserInfo.getDefaultCurrency(),
                    organizationCurrency,
                    'A single-currency org should use its default organization currency.'
                );
            }
        }
    }

    @IsTest
    static void testSalesforceProviderUsesCorporateCurrencyWhenMultiCurrencyIsEnabled() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SalesforceOrganizationCurrencyProvider.multiCurrencyEnabledOverride = true;
            SalesforceOrganizationCurrencyProvider.corporateCurrencyCodeOverride = TEST_BASE_CURRENCY;

            Test.startTest();
            String organizationCurrency = new SalesforceOrganizationCurrencyProvider()
                .getCurrencyCode();
            Test.stopTest();

            System.assertEquals(
                TEST_BASE_CURRENCY,
                organizationCurrency,
                'A multi-currency org should resolve its corporate currency.'
            );
        }
    }

    @IsTest
    static void testSalesforceProviderExercisesCorporateCurrencyQuery() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            SalesforceOrganizationCurrencyProvider.multiCurrencyEnabledOverride = true;
            SalesforceOrganizationCurrencyProvider.corporateCurrencyCodeOverride = null;
            String organizationCurrency;
            QueryException queryFailure;

            Test.startTest();
            try {
                organizationCurrency = new SalesforceOrganizationCurrencyProvider()
                    .getCurrencyCode();
            } catch (QueryException exceptionToCheck) {
                queryFailure = exceptionToCheck;
            }
            Test.stopTest();

            if (UserInfo.isMultiCurrencyOrganization()) {
                System.assertEquals(
                    null,
                    queryFailure,
                    'A multi-currency org should support the corporate CurrencyType query.'
                );
                System.assert(
                    Pattern.matches('[A-Z]{3}', organizationCurrency),
                    'The corporate CurrencyType query should return a three-letter currency.'
                );
            } else {
                System.assertNotEquals(
                    null,
                    queryFailure,
                    'A single-currency org should reject the unavailable CurrencyType query.'
                );
                System.assert(
                    queryFailure.getMessage().contains('CurrencyType'),
                    'The single-currency failure should identify the unavailable CurrencyType object.'
                );
            }
        }
    }

    @IsTest
    static void testControllerReturnsPinnedCurrencyContext() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new Budget_Expense_Manager_Setting__c(
                Name = 'Default',
                Recurring_Expenses_Enabled__c = true,
                Global_Recurring_Run_Time__c = Time.newInstance(8, 0, 0, 0),
                Base_Currency_Code__c = TEST_BASE_CURRENCY
            );

            Test.startTest();
            CurrencyContextDto context = CurrencyContextController.getCurrencyContext();
            Test.stopTest();

            System.assertEquals(
                TEST_BASE_CURRENCY,
                context.baseCurrencyCode,
                'The Lightning-facing context should expose the pinned app base currency.'
            );
            System.assertEquals(
                UserInfo.isMultiCurrencyOrganization(),
                context.multiCurrencyEnabled,
                'The context should report the current organization multi-currency state.'
            );
        }
    }

    @IsTest
    static void testControllerExplainsMissingInitialization() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            try {
                CurrencyContextController.getCurrencyContext();
                System.assert(false, 'Expected currency-context loading to fail.');
            } catch (AuraHandledException exceptionToCheck) {
                System.assertEquals(
                    MISSING_CURRENCY_MESSAGE,
                    exceptionToCheck.getMessage(),
                    'The controller should return a sanitized initialization message.'
                );
            }
        }
    }

    @IsTest
    static void testCachesPinnedContextWithinTransaction() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            insert new Budget_Expense_Manager_Setting__c(
                Name = 'Default',
                Recurring_Expenses_Enabled__c = true,
                Base_Currency_Code__c = TEST_BASE_CURRENCY
            );

            Integer queriesBeforeFirstRead = Limits.getQueries();
            CurrencyContextDto firstContext = CurrencyContextService.getCurrencyContext();
            Integer queriesAfterFirstRead = Limits.getQueries();
            CurrencyContextDto secondContext = CurrencyContextService.getCurrencyContext();

            System.assertEquals(
                queriesBeforeFirstRead + 1,
                queriesAfterFirstRead,
                'The first context read should query the pinned settings currency.'
            );
            System.assertEquals(
                queriesAfterFirstRead,
                Limits.getQueries(),
                'A repeated context read should use the transaction cache.'
            );
            System.assertEquals(
                firstContext.baseCurrencyCode,
                secondContext.baseCurrencyCode,
                'Cached reads should return the same stable base currency.'
            );
        }
    }

    @IsTest
    static void testServiceRejectsInvalidPinnedCurrencyCode() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            try {
                CurrencyContextService.normalizeStoredCurrencyCode('12!');
                System.assert(false, 'Expected an invalid pinned currency to be rejected.');
            } catch (CurrencyContextService.CurrencyContextException exceptionToCheck) {
                System.assertEquals(
                    INVALID_CURRENCY_MESSAGE,
                    exceptionToCheck.getMessage(),
                    'Invalid stored values should fail with a stable domain error.'
                );
            }
        }
    }
}
