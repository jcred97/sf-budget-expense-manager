/** Lightning-safe PHP exchange-rate reference returned for one source currency and date. */
public class ExchangeRateQuoteDto {
    /** Normalized three-letter source currency code. */
    @AuraEnabled
    public String sourceCurrency { get; set; }

    /** Canonical target currency code; always PHP. */
    @AuraEnabled
    public String targetCurrency { get; set; }

    /** Date requested by the user. */
    @AuraEnabled
    public Date requestedDate { get; set; }

    /** Provider observation date, which can precede a weekend or holiday request. */
    @AuraEnabled
    public Date effectiveDate { get; set; }

    /** PHP received for one unit of the source currency. */
    @AuraEnabled
    public Decimal rate { get; set; }

    /** Human-readable provider attribution stored with the Expense. */
    @AuraEnabled
    public String source { get; set; }
}
