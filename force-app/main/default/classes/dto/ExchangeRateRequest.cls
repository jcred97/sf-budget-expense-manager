/** Values accepted when requesting a PHP exchange-rate reference. */
public class ExchangeRateRequest {
    /** Three-letter ISO 4217 source currency code. */
    @AuraEnabled
    public String sourceCurrency { get; set; }

    /** Transaction date whose most recent available reference rate should be used. */
    @AuraEnabled
    public Date requestedDate { get; set; }
}
