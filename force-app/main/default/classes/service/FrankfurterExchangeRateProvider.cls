/** Retrieves ECB reference rates through Frankfurter v2 and the Exchange_Rates_API credential. */
public with sharing class FrankfurterExchangeRateProvider implements ExchangeRateProvider {
    private static final String PROVIDER_SOURCE = 'ECB via Frankfurter';
    private static final Integer TIMEOUT_MILLISECONDS = 10000;
    private static final Map<Integer, String> STATUS_MESSAGES = new Map<Integer, String>{
        404 => 'No exchange rate is available for the selected currency and date.',
        422 => 'The selected currency or date is not supported by the exchange-rate provider.',
        429 => 'The exchange-rate provider is busy. Enter a rate manually or try again shortly.'
    };

    /**
     * Retrieves one Frankfurter v2 rate pinned to the ECB provider.
     *
     * @param sourceCurrency Normalized three-letter source currency code.
     * @param requestedDate Transaction date for the lookup.
     * @return Parsed provider quote.
     */
    public ExchangeRateQuoteDto getPhpRate(String sourceCurrency, Date requestedDate) {
        HttpRequest request = new HttpRequest();
        request.setMethod('GET');
        request.setHeader('Accept', 'application/json');
        request.setTimeout(TIMEOUT_MILLISECONDS);
        request.setEndpoint(buildEndpoint(sourceCurrency, requestedDate));

        HttpResponse response;
        try {
            response = new Http().send(request);
        } catch (CalloutException exceptionToHandle) {
            throw new ExchangeRateService.ExchangeRateException(
                'The exchange-rate provider could not be reached. Enter a rate manually or try again.'
            );
        }

        validateStatus(response.getStatusCode());
        return parseQuote(response.getBody(), sourceCurrency, requestedDate);
    }

    private static String buildEndpoint(String sourceCurrency, Date requestedDate) {
        return 'callout:Exchange_Rates_API/v2/rate/' +
            EncodingUtil.urlEncode(sourceCurrency, 'UTF-8') +
            '/PHP?date=' +
            EncodingUtil.urlEncode(String.valueOf(requestedDate), 'UTF-8') +
            '&providers=ECB';
    }

    private static void validateStatus(Integer statusCode) {
        if (statusCode == 200) {
            return;
        }
        String statusMessage = STATUS_MESSAGES.get(statusCode);
        if (statusMessage != null) {
            throw new ExchangeRateService.ExchangeRateException(statusMessage);
        }
        if (statusCode >= 500) {
            throw new ExchangeRateService.ExchangeRateException(
                'The exchange-rate provider is temporarily unavailable. Enter a rate manually or try again later.'
            );
        }
        throw new ExchangeRateService.ExchangeRateException(
            'Unable to retrieve an exchange rate. Enter a rate manually or try again.'
        );
    }

    private static ExchangeRateQuoteDto parseQuote(
        String responseBody,
        String requestedSourceCurrency,
        Date requestedDate
    ) {
        Map<String, Object> payload = deserializePayload(responseBody);
        String responseBase = stringValue(payload.get('base'))?.trim()?.toUpperCase();
        String responseQuote = stringValue(payload.get('quote'))?.trim()?.toUpperCase();
        Date effectiveDate = dateValue(payload.get('date'));
        Decimal rate = decimalValue(payload.get('rate'));

        if (
            responseBase != requestedSourceCurrency ||
            responseQuote != 'PHP' ||
            effectiveDate == null ||
            rate == null ||
            rate <= 0
        ) {
            throw invalidResponseException();
        }

        ExchangeRateQuoteDto quote = new ExchangeRateQuoteDto();
        quote.sourceCurrency = responseBase;
        quote.targetCurrency = responseQuote;
        quote.requestedDate = requestedDate;
        quote.effectiveDate = effectiveDate;
        quote.rate = rate;
        quote.source = PROVIDER_SOURCE;
        return quote;
    }

    private static Map<String, Object> deserializePayload(String responseBody) {
        try {
            Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(
                responseBody
            );
            if (payload == null) {
                throw invalidResponseException();
            }
            return payload;
        } catch (JSONException exceptionToHandle) {
            throw invalidResponseException();
        } catch (TypeException exceptionToHandle) {
            throw invalidResponseException();
        }
    }

    private static String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Date dateValue(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Date.valueOf(String.valueOf(value));
        } catch (TypeException exceptionToHandle) {
            return null;
        }
    }

    private static Decimal decimalValue(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Decimal.valueOf(String.valueOf(value));
        } catch (TypeException exceptionToHandle) {
            return null;
        }
    }

    private static ExchangeRateService.ExchangeRateException invalidResponseException() {
        return new ExchangeRateService.ExchangeRateException(
            'The exchange-rate provider returned an invalid response. Enter a rate manually.'
        );
    }
}
