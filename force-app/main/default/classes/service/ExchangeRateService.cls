/** Validates exchange-rate requests and normalizes provider quotes for Expense entry. */
public with sharing class ExchangeRateService {
    private static final String TARGET_CURRENCY = 'PHP';
    private static final Integer MAX_RATE_AGE_DAYS = 7;

    /** Sanitized integration or validation failure safe to translate for Lightning clients. */
    public class ExchangeRateException extends Exception {
    }

    /**
     * Returns a validated PHP reference rate for one source currency and transaction date.
     *
     * @param request Currency and transaction date supplied by Lightning.
     * @return A normalized PHP rate quote.
     */
    public static ExchangeRateQuoteDto getPhpRate(ExchangeRateRequest request) {
        if (request == null) {
            throw new ExchangeRateException('Exchange-rate details are required.');
        }

        String sourceCurrency = normalizeCurrencyCode(request.sourceCurrency);
        Date requestedDate = request.requestedDate == null ? Date.today() : request.requestedDate;
        if (requestedDate > Date.today()) {
            throw new ExchangeRateException(
                'Exchange rates cannot be requested for a future date.'
            );
        }
        if (sourceCurrency == TARGET_CURRENCY) {
            return buildIdentityQuote(requestedDate);
        }

        ExchangeRateQuoteDto quote = new FrankfurterExchangeRateProvider()
            .getPhpRate(sourceCurrency, requestedDate);
        validateQuote(quote, sourceCurrency, requestedDate);
        quote.sourceCurrency = sourceCurrency;
        quote.targetCurrency = TARGET_CURRENCY;
        quote.requestedDate = requestedDate;
        return quote;
    }

    private static String normalizeCurrencyCode(String currencyCode) {
        String normalizedCode = currencyCode?.trim()?.toUpperCase();
        if (String.isBlank(normalizedCode) || !Pattern.matches('[A-Z]{3}', normalizedCode)) {
            throw new ExchangeRateException('Enter a valid three-letter currency code.');
        }
        return normalizedCode;
    }

    private static ExchangeRateQuoteDto buildIdentityQuote(Date requestedDate) {
        ExchangeRateQuoteDto quote = new ExchangeRateQuoteDto();
        quote.sourceCurrency = TARGET_CURRENCY;
        quote.targetCurrency = TARGET_CURRENCY;
        quote.requestedDate = requestedDate;
        quote.effectiveDate = requestedDate;
        quote.rate = 1;
        quote.source = 'PHP identity rate';
        return quote;
    }

    private static void validateQuote(
        ExchangeRateQuoteDto quote,
        String sourceCurrency,
        Date requestedDate
    ) {
        requireQuote(quote);
        requireExpectedCurrencyPair(quote, sourceCurrency);
        requireUsableRate(quote);
        if (quote.effectiveDate > requestedDate) {
            throw new ExchangeRateException(
                'The exchange-rate provider returned a rate after the selected transaction date.'
            );
        }
        if (quote.effectiveDate.daysBetween(requestedDate) > MAX_RATE_AGE_DAYS) {
            throw new ExchangeRateException(
                'No recent exchange rate is available for the selected date. Enter a rate manually.'
            );
        }
    }

    private static void requireQuote(ExchangeRateQuoteDto quote) {
        if (quote == null) {
            throw invalidResponseException();
        }
    }

    private static void requireExpectedCurrencyPair(
        ExchangeRateQuoteDto quote,
        String sourceCurrency
    ) {
        if (quote.sourceCurrency != sourceCurrency || quote.targetCurrency != TARGET_CURRENCY) {
            throw invalidResponseException();
        }
    }

    private static void requireUsableRate(ExchangeRateQuoteDto quote) {
        if (
            quote.effectiveDate == null ||
            quote.rate == null ||
            quote.rate <= 0 ||
            String.isBlank(quote.source)
        ) {
            throw invalidResponseException();
        }
    }

    private static ExchangeRateException invalidResponseException() {
        return new ExchangeRateException(
            'The exchange-rate provider returned an invalid response. Enter a rate manually.'
        );
    }
}
