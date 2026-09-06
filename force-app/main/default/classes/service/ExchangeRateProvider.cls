/** Provider boundary for retrieving historical PHP exchange-rate references. */
public interface ExchangeRateProvider {
    /**
     * Retrieves the most recent published PHP rate on or before the requested date.
     *
     * @param sourceCurrency Normalized three-letter source currency code.
     * @param requestedDate Transaction date for the lookup.
     * @return Provider quote expressed as PHP per one source-currency unit.
     */
    ExchangeRateQuoteDto getPhpRate(String sourceCurrency, Date requestedDate);
}
