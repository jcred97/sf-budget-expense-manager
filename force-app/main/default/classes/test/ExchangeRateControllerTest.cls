@IsTest
private class ExchangeRateControllerTest {
    private static final Decimal TEST_RATE = 61.719;

    private class RateResponseMock implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;
        private String expectedEndpoint;

        RateResponseMock(Integer statusCode, String responseBody, String expectedEndpoint) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
            this.expectedEndpoint = expectedEndpoint;
        }

        /**
         * Returns the configured response after verifying request construction.
         *
         * @param request Captured provider request.
         * @return Configured mock response.
         */
        public HttpResponse respond(HttpRequest request) {
            System.assertEquals('GET', request.getMethod(), 'Rates should use an HTTP GET.');
            System.assertEquals(
                expectedEndpoint,
                request.getEndpoint(),
                'The request should use the Named Credential and ECB provider.'
            );
            System.assertEquals(
                'application/json',
                request.getHeader('Accept'),
                'The provider should request JSON.'
            );

            HttpResponse response = new HttpResponse();
            response.setStatusCode(statusCode);
            response.setBody(responseBody);
            return response;
        }
    }

    private class CalloutFailureMock implements HttpCalloutMock {
        /**
         * Simulates a provider connection failure.
         *
         * @param request Captured provider request.
         * @return No response; this method always throws.
         */
        public HttpResponse respond(HttpRequest request) {
            throw new CalloutException('Simulated timeout');
        }
    }

    @IsTest
    static void testReturnsNormalizedEcbQuote() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date requestedDate = Date.today().addDays(-4);
            Test.setMock(HttpCalloutMock.class, successMock('USD', requestedDate, requestedDate));

            Test.startTest();
            ExchangeRateQuoteDto quote = ExchangeRateController.getPhpRate(
                requestFor(' usd ', requestedDate)
            );
            Test.stopTest();

            System.assertEquals(
                'USD',
                quote.sourceCurrency,
                'The source code should be normalized.'
            );
            System.assertEquals('PHP', quote.targetCurrency, 'PHP should remain the target.');
            System.assertEquals(
                requestedDate,
                quote.requestedDate,
                'The request date should echo.'
            );
            System.assertEquals(
                requestedDate,
                quote.effectiveDate,
                'The effective date should persist.'
            );
            System.assertEquals(
                TEST_RATE,
                quote.rate,
                'The provider rate should be returned exactly.'
            );
            System.assertEquals(
                'ECB via Frankfurter',
                quote.source,
                'The quote should carry stable attribution.'
            );
        }
    }

    @IsTest
    static void testAcceptsRecentPriorPublishedRate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date requestedDate = Date.today().addDays(-1);
            Date effectiveDate = requestedDate.addDays(-2);
            Test.setMock(HttpCalloutMock.class, successMock('EUR', requestedDate, effectiveDate));

            Test.startTest();
            ExchangeRateQuoteDto quote = ExchangeRateController.getPhpRate(
                requestFor('EUR', requestedDate)
            );
            Test.stopTest();

            System.assertEquals(
                effectiveDate,
                quote.effectiveDate,
                'A recent prior observation should support weekends and provider holidays.'
            );
        }
    }

    @IsTest
    static void testNullDateDefaultsToToday() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date today = Date.today();
            Test.setMock(HttpCalloutMock.class, successMock('JPY', today, today));
            ExchangeRateRequest request = requestFor('JPY', null);

            Test.startTest();
            ExchangeRateQuoteDto quote = ExchangeRateController.getPhpRate(request);
            Test.stopTest();

            System.assertEquals(today, quote.requestedDate, 'An omitted date should use today.');
            System.assertEquals(
                today,
                quote.effectiveDate,
                'The provider date should be retained.'
            );
        }
    }

    @IsTest
    static void testPhpIdentityDoesNotCallProvider() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            ExchangeRateRequest request = requestFor('php', null);

            Test.startTest();
            ExchangeRateQuoteDto quote = ExchangeRateController.getPhpRate(request);
            Integer calloutCount = Limits.getCallouts();
            Test.stopTest();

            System.assertEquals(0, calloutCount, 'PHP should not make a network request.');
            System.assertEquals(1, quote.rate, 'PHP to PHP should use an identity rate.');
            System.assertEquals(Date.today(), quote.effectiveDate, 'Identity should use today.');
            System.assertEquals(
                'PHP identity rate',
                quote.source,
                'Identity should be attributable.'
            );
        }
    }

    @IsTest
    static void testRequestValidation() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            assertFailure(null, 'Exchange-rate details are required.');
            assertFailure(
                requestFor(null, Date.today()),
                'Enter a valid three-letter currency code.'
            );
            assertFailure(
                requestFor('US', Date.today()),
                'Enter a valid three-letter currency code.'
            );
            assertFailure(
                requestFor('USD', Date.today().addDays(1)),
                'Exchange rates cannot be requested for a future date.'
            );
            System.assertEquals(
                0,
                Limits.getDmlStatements(),
                'Rate validation must remain read-only.'
            );
        }
    }

    @IsTest
    static void testRejectsStaleOrFutureEffectiveDate() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date requestedDate = Date.today().addDays(-1);
            Test.setMock(
                HttpCalloutMock.class,
                successMock('USD', requestedDate, requestedDate.addDays(-8))
            );
            assertFailure(
                requestFor('USD', requestedDate),
                'No recent exchange rate is available for the selected date. Enter a rate manually.'
            );

            Test.setMock(
                HttpCalloutMock.class,
                successMock('USD', requestedDate, requestedDate.addDays(1))
            );
            assertFailure(
                requestFor('USD', requestedDate),
                'The exchange-rate provider returned a rate after the selected transaction date.'
            );
            System.assertEquals(0, Limits.getDmlStatements(), 'Rate lookup must remain read-only.');
        }
    }

    @IsTest
    static void testMapsProviderStatusesToFriendlyErrors() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date requestedDate = Date.today().addDays(-1);
            assertStatusFailure(
                404,
                requestedDate,
                'No exchange rate is available for the selected currency and date.'
            );
            assertStatusFailure(
                422,
                requestedDate,
                'The selected currency or date is not supported by the exchange-rate provider.'
            );
            assertStatusFailure(
                429,
                requestedDate,
                'The exchange-rate provider is busy. Enter a rate manually or try again shortly.'
            );
            assertStatusFailure(
                503,
                requestedDate,
                'The exchange-rate provider is temporarily unavailable. Enter a rate manually or try again later.'
            );
            assertStatusFailure(
                400,
                requestedDate,
                'Unable to retrieve an exchange rate. Enter a rate manually or try again.'
            );
            System.assertEquals(0, Limits.getDmlStatements(), 'Rate lookup must remain read-only.');
        }
    }

    @IsTest
    static void testRejectsMalformedMismatchedAndNonPositiveResponses() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Date requestedDate = Date.today().addDays(-1);
            String expectedMessage = 'The exchange-rate provider returned an invalid response. Enter a rate manually.';

            Test.setMock(
                HttpCalloutMock.class,
                responseMock(200, '{not-json', endpointFor('USD', requestedDate))
            );
            assertFailure(requestFor('USD', requestedDate), expectedMessage);

            Test.setMock(
                HttpCalloutMock.class,
                responseMock(
                    200,
                    responseBody('EUR', requestedDate, TEST_RATE),
                    endpointFor('USD', requestedDate)
                )
            );
            assertFailure(requestFor('USD', requestedDate), expectedMessage);

            Test.setMock(
                HttpCalloutMock.class,
                responseMock(
                    200,
                    responseBody('USD', requestedDate, 0),
                    endpointFor('USD', requestedDate)
                )
            );
            assertFailure(requestFor('USD', requestedDate), expectedMessage);
            System.assertEquals(0, Limits.getDmlStatements(), 'Rate lookup must remain read-only.');
        }
    }

    @IsTest
    static void testMapsCalloutFailureToFriendlyError() {
        System.runAs(new User(Id = UserInfo.getUserId())) {
            Test.setMock(HttpCalloutMock.class, new CalloutFailureMock());

            assertFailure(
                requestFor('USD', Date.today().addDays(-1)),
                'The exchange-rate provider could not be reached. Enter a rate manually or try again.'
            );
            System.assertEquals(0, Limits.getDmlStatements(), 'Rate lookup must remain read-only.');
        }
    }

    private static RateResponseMock successMock(
        String sourceCurrency,
        Date requestedDate,
        Date effectiveDate
    ) {
        return responseMock(
            200,
            responseBody(sourceCurrency, effectiveDate, TEST_RATE),
            endpointFor(sourceCurrency, requestedDate)
        );
    }

    private static RateResponseMock responseMock(
        Integer statusCode,
        String body,
        String expectedEndpoint
    ) {
        return new RateResponseMock(statusCode, body, expectedEndpoint);
    }

    private static String responseBody(String baseCurrency, Date effectiveDate, Decimal rate) {
        return JSON.serialize(
            new Map<String, Object>{
                'date' => String.valueOf(effectiveDate),
                'base' => baseCurrency,
                'quote' => 'PHP',
                'rate' => rate
            }
        );
    }

    private static ExchangeRateRequest requestFor(String sourceCurrency, Date requestedDate) {
        ExchangeRateRequest request = new ExchangeRateRequest();
        request.sourceCurrency = sourceCurrency;
        request.requestedDate = requestedDate;
        return request;
    }

    private static String endpointFor(String sourceCurrency, Date requestedDate) {
        return 'callout:Exchange_Rates_API/v2/rate/' +
            sourceCurrency +
            '/PHP?date=' +
            String.valueOf(requestedDate) +
            '&providers=ECB';
    }

    private static void assertStatusFailure(
        Integer statusCode,
        Date requestedDate,
        String expectedMessage
    ) {
        Test.setMock(
            HttpCalloutMock.class,
            responseMock(statusCode, '{}', endpointFor('USD', requestedDate))
        );
        assertFailure(requestFor('USD', requestedDate), expectedMessage);
    }

    private static void assertFailure(ExchangeRateRequest request, String expectedMessage) {
        try {
            ExchangeRateController.getPhpRate(request);
            System.assert(false, 'Expected the exchange-rate request to fail.');
        } catch (AuraHandledException exceptionToCheck) {
            System.assertEquals(
                expectedMessage,
                exceptionToCheck.getMessage(),
                'The client should receive a stable, sanitized error.'
            );
        }
    }
}
